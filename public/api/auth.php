<?php
// Inicio de sesión (con verificación en dos pasos), registro, cierre de sesión, «Mi cuenta» y datos de la sesión actual.
require_once dirname(__DIR__, 2) . '/src/comun.php';
require_once dirname(__DIR__, 2) . '/src/contrasenas.php';
require_once dirname(__DIR__, 2) . '/src/totp.php';
require_once dirname(__DIR__, 2) . '/src/mensajes.php';
require_once dirname(__DIR__, 2) . '/src/codigos.php';

const VENTANA_LOGIN = 900; // 15 min
// password_verify corre siempre (exista o no el correo) para que el tiempo de respuesta no delate cuentas.
// Es el hash de una cadena aleatoria descartada: no corresponde a ninguna contraseña. nosemgrep
const HASH_FICTICIO = '$2y$12$QkRwtloHYxOSLfUwH6bd8eL0qAZJI3znYa18/ySu3YuMh/iy15A12';

switch (accion()) {
    case 'yo':
        $u = usuario();
        responder([
            'usuario' => $u ? [
                'id' => $u['id'], 'nombre' => $u['nombre'], 'email' => $u['email'], 'totp' => $u['totp_activo'],
                'telefono' => enmascarar('sms', $u['telefono'] ?? null),
                'email_verificado' => $u['email_verificado'] ?? false, 'telefono_verificado' => $u['telefono_verificado'] ?? false,
                'requiere_verificar' => $u['requiere_verificar'] ?? false, 'segundo_factor' => $u['segundo_factor'] ?? null,
            ] : null,
            'sms' => smsDisponible(),
            'correo' => correoDisponible(),
            'rol' => rol(),
            'csrf' => $_SESSION['csrf'],
            'pendiente_2fa' => !$u && !empty($_SESSION['pendiente_2fa']),
            // Segundo paso por correo o SMS: a dónde se mandó el código (para reanudar tras recargar la página).
            'pendiente' => !$u && !empty($_SESSION['pendiente_2fa']['metodo'])
                ? ['canal' => $_SESSION['pendiente_2fa']['metodo'], 'destino' => $_SESSION['pendiente_2fa']['destino'], 'reenviar_en' => 0] : null,
        ]);

    case 'entrar':
        exigirPost();
        $d = entrada();
        $email = strtolower(texto($d, 'email', 190, true));
        $pass = (string)($d['password'] ?? '');
        // Por conexión y por correo desde la misma conexión: nadie puede bloquear la cuenta de otra persona
        // desde su propia red. El tope por correo (de cualquier red) frena ataques distribuidos.
        $espera = 'Demasiados intentos. Espera 15 minutos e intenta de nuevo.';
        limitar('login-ip:' . ip(), 30, VENTANA_LOGIN, $espera);
        limitar('login-correo-ip:' . $email . '|' . ip(), 6, VENTANA_LOGIN, $espera);
        limitar('login-correo:' . $email, 60, VENTANA_LOGIN, $espera);

        $u = uno('SELECT id, email, password_hash, estado, totp_activo, segundo_factor, telefono, telefono_verificado FROM usuarios WHERE email = ?', [$email]);
        $ok = password_verify($pass, $u['password_hash'] ?? HASH_FICTICIO) && $u;
        ejecutar('INSERT INTO intentos_login (email, ip, exito) VALUES (?, ?, ?)', [$email, ip(), $ok ? 1 : 0]);
        if (!$ok) fallar('El correo o la contraseña no coinciden. Revísalos e intenta de nuevo.', 401);
        if ($u['estado'] !== 'activo') fallar('Tu cuenta está suspendida. Escribe a la administración.', 403);

        if (password_needs_rehash($u['password_hash'], PASSWORD_BCRYPT, HASH_OPCIONES)) {
            ejecutar('UPDATE usuarios SET password_hash = ? WHERE id = ?', [hashContrasena($pass), $u['id']]);
        }
        if ($u['totp_activo']) {
            // Contraseña correcta; falta el código. La sesión todavía no tiene usuario.
            session_regenerate_id(true);
            $_SESSION['pendiente_2fa'] = ['id' => (int)$u['id'], 't' => time()];
            responder(['ok' => true, 'paso' => '2fa', 'metodo' => 'totp', 'csrf' => $_SESSION['csrf']]);
        }
        if ($u['segundo_factor']) {
            // Segundo paso por código enviado. Si el SMS no se puede usar (teléfono sin verificar o sin proveedor),
            // el código va al correo de la cuenta.
            $sms = $u['segundo_factor'] === 'sms' && $u['telefono'] && $u['telefono_verificado'] && smsDisponible();
            [$canal, $destino] = $sms ? ['sms', $u['telefono']] : ['correo', $u['email']];
            session_regenerate_id(true);
            $_SESSION['pendiente_2fa'] = ['id' => (int)$u['id'], 't' => time(), 'metodo' => $canal, 'destino' => enmascarar($canal, $destino)];
            // Si entra dos veces seguidas (espera de 60 s), el código anterior sigue sirviendo.
            $envio = emitirCodigo((int)$u['id'], 'login', $canal, $destino, true);
            if (!$envio && !valor("SELECT 1 FROM codigos_verificacion WHERE usuario_id = ? AND proposito = 'login' AND usado IS NULL AND expira > NOW()", [$u['id']])) {
                unset($_SESSION['pendiente_2fa']);
                fallar('No pudimos enviarte el código. Intenta de nuevo en un momento.', 502);
            }
            $envio ??= ['canal' => $canal, 'destino' => enmascarar($canal, $destino), 'reenviar_en' => CODIGO_ESPERA];
            responder(['ok' => true, 'paso' => '2fa', 'metodo' => $canal, 'csrf' => $_SESSION['csrf']] + $envio);
        }
        iniciarSesion((int)$u['id']);
        registrar('login', 'usuario', (int)$u['id']);
        responder(['ok' => true, 'rol' => rol(), 'csrf' => $_SESSION['csrf']]);

    case 'verificar_2fa':
        exigirPost();
        $p = $_SESSION['pendiente_2fa'] ?? null;
        if (!$p || time() - $p['t'] > 300) {
            unset($_SESSION['pendiente_2fa']);
            fallar('Pasaron más de 5 minutos. Vuelve a escribir tu contraseña.', 401);
        }
        limitar('2fa:' . $p['id'], 6, 300, 'Demasiados códigos incorrectos. Espera 5 minutos.');
        $codigo = (string)(entrada()['codigo'] ?? '');
        $ok = empty($p['metodo']) ? verificarSegundoFactor($p['id'], $codigo) : verificarCodigo($p['id'], 'login', $codigo) !== null;
        if (!$ok) {
            ejecutar('INSERT INTO intentos_login (email, ip, exito) VALUES ((SELECT email FROM usuarios WHERE id = ?), ?, 0)', [$p['id'], ip()]);
            fallar(empty($p['metodo']) ? 'El código no es correcto o ya se usó. Revisa la app de autenticación.'
                                       : 'El código no es correcto o ya caducó. Puedes pedir otro.', 401);
        }
        unset($_SESSION['pendiente_2fa']);
        iniciarSesion($p['id']);
        registrar('login', 'usuario', $p['id'], ['2fa' => $p['metodo'] ?? 'totp']);
        responder(['ok' => true, 'rol' => rol(), 'csrf' => $_SESSION['csrf']]);

    case 'registrar':
        exigirPost();
        $d = entrada();
        $nombre = texto($d, 'nombre', 120, true);
        $email = strtolower(texto($d, 'email', 190, true));
        $pass = (string)($d['password'] ?? '');
        $rolPedido = ($d['rol'] ?? 'alumno') === 'profesor' ? 'profesor' : 'alumno'; // el admin solo se crea por consola
        $textoTel = trim((string)($d['telefono'] ?? ''));

        limitar('registro:' . ip(), 10, 3600, 'Demasiados registros desde esta conexión. Intenta más tarde.');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fallar('Escribe un correo válido, por ejemplo nombre@gmail.com.', 422);
        if ($problema = problemaContrasena($pass, $email, $nombre)) fallar($problema, 422);
        $telefono = null;
        if ($textoTel !== '' && !($telefono = normalizarTelefono($textoTel))) {
            fallar('Escribe tu teléfono a 10 dígitos (por ejemplo 55 1234 5678) o con el código de país (+1…), o déjalo vacío.', 422);
        }
        // Riesgo aceptado: avisar que el correo ya existe ayuda a quien olvidó que tenía cuenta; el límite
        // por conexión de arriba frena que se use para adivinar correos en masa.
        if (valor('SELECT 1 FROM usuarios WHERE email = ?', [$email])) fallar('Ya existe una cuenta con ese correo. Inicia sesión.', 409);

        // La cuenta nueva debe verificar su correo o su teléfono antes de subir, postularse o inscribirse.
        ejecutar('INSERT INTO usuarios (nombre, email, password_hash, rol, telefono, requiere_verificar) VALUES (?, ?, ?, ?, ?, 1)',
            [$nombre, $email, hashContrasena($pass), $rolPedido, $telefono]);
        $id = (int)db()->lastInsertId();
        iniciarSesion($id);
        registrar('registro', 'usuario', $id, ['rol' => $rolPedido, 'telefono' => $telefono !== null]);
        $paso = correoDisponible() || ($telefono && smsDisponible()) ? 'verificar' : null;
        responder(['ok' => true, 'rol' => $rolPedido, 'paso' => $paso, 'csrf' => $_SESSION['csrf']], 201);

    case 'cambiar_password':
        exigirPost();
        $u = requiereRol('admin', 'profesor', 'alumno');
        $d = entrada();
        $nueva = (string)($d['nueva'] ?? '');
        limitar('cambiar-password:' . $u['id'], 10, 3600);
        $hash = valor('SELECT password_hash FROM usuarios WHERE id = ?', [$u['id']]);
        if (!password_verify((string)($d['actual'] ?? ''), $hash)) fallar('Tu contraseña actual no coincide.', 403);
        if ($problema = problemaContrasena($nueva, $u['email'], $u['nombre'])) fallar($problema, 422);
        if (password_verify($nueva, $hash)) fallar('La contraseña nueva debe ser distinta de la actual.', 422);
        // Sube la versión: las demás sesiones abiertas de esta cuenta se cierran; esta sigue activa.
        ejecutar('UPDATE usuarios SET password_hash = ?, sesion_version = sesion_version + 1 WHERE id = ?', [hashContrasena($nueva), $u['id']]);
        session_regenerate_id(true);
        $_SESSION['version'] = (int)valor('SELECT sesion_version FROM usuarios WHERE id = ?', [$u['id']]);
        registrar('password_cambiar', 'usuario', $u['id']);
        responder(['ok' => true]);

    case 'confirmar':
        // Vuelve a pedir la contraseña (y el código 2FA si está activo) antes de una acción delicada.
        exigirPost();
        $u = requiereRol('admin', 'profesor', 'alumno');
        $d = entrada();
        limitar('confirmar:' . $u['id'], 8, 900, 'Demasiados intentos. Espera 15 minutos.');
        $hash = valor('SELECT password_hash FROM usuarios WHERE id = ?', [$u['id']]);
        if (!password_verify((string)($d['password'] ?? ''), $hash)) fallar('La contraseña no coincide.', 403);
        if ($u['totp_activo'] && !verificarSegundoFactor($u['id'], (string)($d['codigo'] ?? ''))) fallar('El código de verificación no es correcto.', 403);
        $_SESSION['reauth'] = time();
        registrar('reautenticacion', 'usuario', $u['id']);
        responder(['ok' => true]);

    case 'totp_iniciar':
        // Genera un secreto nuevo (todavía no activo) para que la persona lo agregue a su app.
        exigirPost();
        $u = requiereRol('admin', 'profesor', 'alumno');
        if ($u['totp_activo']) fallar('La verificación en dos pasos ya está activa.', 409);
        $secreto = totpNuevoSecreto();
        $_SESSION['totp_nuevo'] = $secreto;
        responder(['secreto' => $secreto, 'uri' => totpUri($secreto, $u['email'])]);

    case 'totp_activar':
        exigirPost();
        $u = requiereRol('admin', 'profesor', 'alumno');
        $secreto = $_SESSION['totp_nuevo'] ?? fallar('Primero genera el código QR.', 409);
        limitar('totp-activar:' . $u['id'], 10, 900);
        $paso = totpVerificar($secreto, (string)(entrada()['codigo'] ?? ''));
        if ($paso === null) fallar('El código no coincide. Revisa que la hora de tu teléfono sea automática.', 422);
        $codigos = codigosRecuperacion();
        // La app reemplaza al código por correo o SMS.
        ejecutar('UPDATE usuarios SET totp_secreto = ?, totp_activo = 1, totp_ultimo = ?, totp_recuperacion = ?, segundo_factor = NULL WHERE id = ?', [
            cifrar($secreto), $paso, json_encode(array_map(fn($c) => hashContrasena($c), $codigos)), $u['id'],
        ]);
        unset($_SESSION['totp_nuevo']);
        olvidarUsuarioEnSesion();
        registrar('2fa_activar', 'usuario', $u['id']);
        responder(['ok' => true, 'recuperacion' => $codigos]);

    case 'totp_desactivar':
        exigirPost();
        $u = requiereRol('admin', 'profesor', 'alumno');
        if ($u['rol'] === 'admin') fallar('Las cuentas de admin deben mantener la verificación en dos pasos.', 403);
        exigirReautenticacion();
        ejecutar('UPDATE usuarios SET totp_secreto = NULL, totp_activo = 0, totp_ultimo = NULL, totp_recuperacion = NULL WHERE id = ?', [$u['id']]);
        olvidarUsuarioEnSesion();
        registrar('2fa_desactivar', 'usuario', $u['id']);
        responder(['ok' => true]);

    case 'codigo_enviar':
        // Manda un código para verificar el correo o el teléfono de la cuenta.
        exigirPost();
        $u = requiereRol('admin', 'profesor', 'alumno');
        $proposito = (string)(entrada()['proposito'] ?? '');
        if ($proposito === 'verificar_correo') {
            if ($u['email_verificado']) fallar('Tu correo ya está verificado.', 409);
            if (!correoDisponible()) fallar('El envío de correos no está disponible por ahora.', 503);
            responder(['ok' => true] + emitirCodigo($u['id'], $proposito, 'correo', $u['email']));
        }
        if ($proposito === 'verificar_telefono') {
            if (!$u['telefono']) fallar('Primero agrega tu teléfono.', 409);
            if ($u['telefono_verificado']) fallar('Tu teléfono ya está verificado.', 409);
            if (!smsDisponible()) fallar('El envío por SMS no está disponible por ahora. Verifica tu correo.', 503);
            responder(['ok' => true] + emitirCodigo($u['id'], $proposito, 'sms', $u['telefono']));
        }
        fallar('Propósito no válido.', 422);

    case 'codigo_verificar':
        exigirPost();
        $u = requiereRol('admin', 'profesor', 'alumno');
        $d = entrada();
        $proposito = (string)($d['proposito'] ?? '');
        if (!in_array($proposito, ['verificar_correo', 'verificar_telefono'], true)) fallar('Propósito no válido.', 422);
        limitar('codigo-verificar:' . $u['id'], 15, 900, 'Demasiados códigos incorrectos. Espera 15 minutos.');
        $f = verificarCodigo($u['id'], $proposito, (string)($d['codigo'] ?? ''));
        // El código vale solo para el contacto al que se mandó (si cambió el teléfono después, ya no sirve).
        $actual = $proposito === 'verificar_correo' ? $u['email'] : $u['telefono'];
        if (!$f || !hash_equals((string)$actual, $f['destino'])) fallar('El código no es correcto o ya caducó. Pide uno nuevo si hace falta.', 422);
        ejecutar($proposito === 'verificar_correo'
            ? 'UPDATE usuarios SET email_verificado = NOW() WHERE id = ?'
            : 'UPDATE usuarios SET telefono_verificado = NOW() WHERE id = ?', [$u['id']]);
        olvidarUsuarioEnSesion();
        registrar($proposito === 'verificar_correo' ? 'correo_verificar' : 'telefono_verificar', 'usuario', $u['id']);
        responder(['ok' => true]);

    case 'telefono_guardar':
        // Agregar el teléfono no pide nada; cambiarlo o quitarlo pide confirmar la contraseña.
        // Al cambiarlo deja de estar verificado y, si se usaba para el segundo paso, este se apaga.
        exigirPost();
        $u = requiereRol('admin', 'profesor', 'alumno');
        if ($u['telefono']) exigirReautenticacion();
        $texto = trim((string)(entrada()['telefono'] ?? ''));
        $telefono = null;
        if ($texto !== '' && !($telefono = normalizarTelefono($texto))) {
            fallar('Escribe tu teléfono a 10 dígitos (por ejemplo 55 1234 5678) o con el código de país (+1…).', 422);
        }
        if ($telefono === $u['telefono']) responder(['ok' => true]);
        limitar('telefono-guardar:' . $u['id'], 10, 86400, 'Cambiaste tu teléfono demasiadas veces hoy.');
        ejecutar("UPDATE usuarios SET telefono = ?, telefono_verificado = NULL,
                  segundo_factor = IF(segundo_factor = 'sms', NULL, segundo_factor) WHERE id = ?", [$telefono, $u['id']]);
        olvidarUsuarioEnSesion();
        registrar($telefono ? 'telefono_guardar' : 'telefono_quitar', 'usuario', $u['id']);
        responder(['ok' => true, 'telefono' => enmascarar('sms', $telefono)]);

    case 'codigo_reenviar_login':
        // Otro código para el segundo paso (mientras la contraseña siga vigente: 5 min).
        exigirPost();
        $p = $_SESSION['pendiente_2fa'] ?? null;
        if (!$p || empty($p['metodo']) || time() - $p['t'] > 300) fallar('Pasaron más de 5 minutos. Vuelve a escribir tu contraseña.', 401);
        $f = uno('SELECT email, telefono FROM usuarios WHERE id = ?', [$p['id']]);
        responder(['ok' => true] + emitirCodigo($p['id'], 'login', $p['metodo'], $p['metodo'] === 'sms' ? $f['telefono'] : $f['email']));

    case 'segundo_factor':
        // Segundo paso por código al correo o por SMS (alumno y profesor). Los admin usan solo la app (TOTP).
        exigirPost();
        $u = requiereRol('admin', 'profesor', 'alumno');
        $metodo = entrada()['metodo'] ?? null;
        if (!in_array($metodo, ['correo', 'sms', null], true)) fallar('Método no válido.', 422);
        if ($metodo !== null && $u['rol'] === 'admin') fallar('Las cuentas de admin usan la app de autenticación.', 403);
        if ($metodo !== null && $u['totp_activo']) fallar('Ya tienes la app de autenticación activa. Desactívala primero.', 409);
        if ($metodo === 'correo' && (!$u['email_verificado'] || !correoDisponible())) fallar('Primero verifica tu correo.', 409);
        if ($metodo === 'sms' && (!$u['telefono_verificado'] || !smsDisponible())) fallar('Primero agrega y verifica tu teléfono.', 409);
        exigirReautenticacion();
        ejecutar('UPDATE usuarios SET segundo_factor = ? WHERE id = ?', [$metodo, $u['id']]);
        olvidarUsuarioEnSesion();
        registrar($metodo ? 'segundo_factor_activar' : 'segundo_factor_desactivar', 'usuario', $u['id'], $metodo ? ['metodo' => $metodo] : null);
        responder(['ok' => true]);

    case 'recuperar_enviar':
        // «¿Olvidaste tu contraseña?»: responde lo mismo, y antes de enviar, exista o no la cuenta,
        // para que ni la respuesta ni su tiempo delaten qué correos están registrados.
        exigirPost();
        $d = entrada();
        $email = strtolower((string)texto($d, 'email', 190, true));
        $canal = ($d['canal'] ?? '') === 'sms' ? 'sms' : 'correo';
        if (!correoDisponible() && !smsDisponible()) fallar('La recuperación por código no está disponible por ahora. Escribe a la administración.', 503);
        limitar('recuperar-ip:' . ip(), 10, 3600, 'Pediste demasiados códigos. Espera un rato e intenta de nuevo.');
        limitar('recuperar-correo:' . $email, 5, 3600, 'Pediste demasiados códigos. Espera un rato e intenta de nuevo.');
        $u = uno("SELECT id, email, telefono, telefono_verificado FROM usuarios WHERE email = ? AND estado = 'activo'", [$email]);
        terminarRespuesta(['ok' => true, 'canal' => $canal, 'reenviar_en' => CODIGO_ESPERA,
            'mensaje' => 'Si hay una cuenta con ese correo, te mandamos un código de 6 dígitos'
                . ($canal === 'sms' ? ' por SMS a su teléfono verificado (o al correo, si no tiene).' : '.') . ' Caduca en 10 minutos.']);
        if ($u) {
            $sms = $canal === 'sms' && $u['telefono'] && $u['telefono_verificado'] && smsDisponible();
            emitirCodigo((int)$u['id'], 'recuperar', $sms ? 'sms' : 'correo', $sms ? $u['telefono'] : $u['email'], true);
        }
        exit;

    case 'recuperar_verificar':
        exigirPost();
        $d = entrada();
        $email = strtolower((string)texto($d, 'email', 190, true));
        limitar('recuperar-verificar-ip:' . ip(), 30, 900, 'Demasiados intentos. Espera 15 minutos.');
        $id = (int)valor("SELECT id FROM usuarios WHERE email = ? AND estado = 'activo'", [$email]);
        $f = $id ? verificarCodigo($id, 'recuperar', (string)($d['codigo'] ?? '')) : null;
        if (!$f) fallar('El código no es correcto o ya caducó. Puedes pedir otro.', 422);
        session_regenerate_id(true);
        $_SESSION['recuperar'] = ['id' => $id, 't' => time(), 'canal' => $f['canal'], 'destino' => $f['destino']];
        responder(['ok' => true]);

    case 'recuperar_cambiar':
        // Con el código ya verificado (10 min): guarda la contraseña nueva y cierra todas las sesiones.
        // No inicia sesión: la persona entra con su contraseña nueva (y su segundo paso, si lo tiene).
        exigirPost();
        $r = $_SESSION['recuperar'] ?? null;
        if (!$r) fallar('Primero escribe el código que te mandamos.', 401);
        if (time() - $r['t'] > 600) {
            unset($_SESSION['recuperar']);
            fallar('Pasaron más de 10 minutos. Pide un código nuevo.', 401);
        }
        $nueva = (string)(entrada()['nueva'] ?? '');
        $u = uno('SELECT email, nombre, telefono, password_hash FROM usuarios WHERE id = ?', [$r['id']]);
        if ($problema = problemaContrasena($nueva, $u['email'], $u['nombre'])) fallar($problema, 422);
        if (password_verify($nueva, $u['password_hash'])) fallar('La contraseña nueva debe ser distinta de la anterior.', 422);
        // El código demostró que el contacto es suyo: queda verificado.
        $verificado = $r['canal'] === 'sms'
            ? ($r['destino'] === $u['telefono'] ? ', telefono_verificado = COALESCE(telefono_verificado, NOW())' : '')
            : ($r['destino'] === $u['email'] ? ', email_verificado = COALESCE(email_verificado, NOW())' : '');
        ejecutar("UPDATE usuarios SET password_hash = ?, sesion_version = sesion_version + 1{$verificado} WHERE id = ?", [hashContrasena($nueva), $r['id']]);
        unset($_SESSION['recuperar']);
        registrar('password_recuperar', 'usuario', $r['id'], ['canal' => $r['canal']]);
        responder(['ok' => true]);

    case 'salir':
        exigirPost();
        if (usuario()) registrar('logout', 'usuario', usuario()['id']);
        cerrarSesion();
        responder(['ok' => true]);

    default:
        fallar('Acción no válida.', 404);
}

function iniciarSesion(int $id): void {
    session_regenerate_id(true);
    $_SESSION['uid'] = $id;
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
    $_SESSION['inicio'] = $_SESSION['ultimo'] = time();
    $_SESSION['version'] = (int)valor('SELECT sesion_version FROM usuarios WHERE id = ?', [$id]);
    unset($_SESSION['usuario'], $_SESSION['usuario_t'], $_SESSION['reauth']);
    ejecutar('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ?', [$id]);
}

// Código de la app (TOTP, una sola vez cada uno) o código de recuperación (se consume al usarlo).
function verificarSegundoFactor(int $id, string $codigo): bool {
    $f = uno('SELECT totp_secreto, totp_ultimo, totp_recuperacion FROM usuarios WHERE id = ? AND totp_activo = 1', [$id]);
    if (!$f) return false;
    $secreto = descifrar((string)$f['totp_secreto']);
    if ($secreto !== null && ($paso = totpVerificar($secreto, $codigo, $f['totp_ultimo'] !== null ? (int)$f['totp_ultimo'] : null)) !== null) {
        // Solo avanza si nadie usó ese paso entre la lectura y ahora (dos peticiones con el mismo código).
        return ejecutar('UPDATE usuarios SET totp_ultimo = ? WHERE id = ? AND (totp_ultimo IS NULL OR totp_ultimo < ?)', [$paso, $id, $paso]) === 1;
    }
    $codigo = strtolower(trim($codigo));
    $hashes = json_decode((string)$f['totp_recuperacion'], true) ?: [];
    foreach ($hashes as $i => $h) {
        if (password_verify($codigo, $h)) {
            unset($hashes[$i]);
            ejecutar('UPDATE usuarios SET totp_recuperacion = ? WHERE id = ?', [json_encode(array_values($hashes)), $id]);
            registrar('2fa_recuperacion', 'usuario', $id, ['quedan' => count($hashes)]);
            return true;
        }
    }
    return false;
}
