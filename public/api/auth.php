<?php
// Inicio de sesión (con verificación en dos pasos), registro, cierre de sesión, «Mi cuenta» y datos de la sesión actual.
require_once dirname(__DIR__, 2) . '/src/comun.php';
require_once dirname(__DIR__, 2) . '/src/contrasenas.php';
require_once dirname(__DIR__, 2) . '/src/totp.php';

const VENTANA_LOGIN = 900; // 15 min
// password_verify corre siempre (exista o no el correo) para que el tiempo de respuesta no delate cuentas.
const HASH_FICTICIO = '$2y$12$QkRwtloHYxOSLfUwH6bd8eL0qAZJI3znYa18/ySu3YuMh/iy15A12';

switch (accion()) {
    case 'yo':
        $u = usuario();
        responder([
            'usuario' => $u ? ['id' => $u['id'], 'nombre' => $u['nombre'], 'email' => $u['email'], 'totp' => $u['totp_activo']] : null,
            'rol' => rol(),
            'csrf' => $_SESSION['csrf'],
            'pendiente_2fa' => !$u && !empty($_SESSION['pendiente_2fa']),
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

        $u = uno('SELECT id, password_hash, estado, totp_activo FROM usuarios WHERE email = ?', [$email]);
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
            responder(['ok' => true, 'paso' => '2fa', 'csrf' => $_SESSION['csrf']]);
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
        if (!verificarSegundoFactor($p['id'], (string)(entrada()['codigo'] ?? ''))) {
            ejecutar('INSERT INTO intentos_login (email, ip, exito) VALUES ((SELECT email FROM usuarios WHERE id = ?), ?, 0)', [$p['id'], ip()]);
            fallar('El código no es correcto o ya se usó. Revisa la app de autenticación.', 401);
        }
        unset($_SESSION['pendiente_2fa']);
        iniciarSesion($p['id']);
        registrar('login', 'usuario', $p['id'], ['2fa' => true]);
        responder(['ok' => true, 'rol' => rol(), 'csrf' => $_SESSION['csrf']]);

    case 'registrar':
        exigirPost();
        $d = entrada();
        $nombre = texto($d, 'nombre', 120, true);
        $email = strtolower(texto($d, 'email', 190, true));
        $pass = (string)($d['password'] ?? '');
        $rolPedido = ($d['rol'] ?? 'alumno') === 'profesor' ? 'profesor' : 'alumno'; // el admin solo se crea por consola

        limitar('registro:' . ip(), 10, 3600, 'Demasiados registros desde esta conexión. Intenta más tarde.');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fallar('Escribe un correo válido, por ejemplo nombre@gmail.com.', 422);
        if ($problema = problemaContrasena($pass, $email, $nombre)) fallar($problema, 422);
        // Riesgo aceptado: avisar que el correo ya existe ayuda a quien olvidó que tenía cuenta; el límite
        // por conexión de arriba frena que se use para adivinar correos en masa.
        if (valor('SELECT 1 FROM usuarios WHERE email = ?', [$email])) fallar('Ya existe una cuenta con ese correo. Inicia sesión.', 409);

        ejecutar('INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)',
            [$nombre, $email, hashContrasena($pass), $rolPedido]);
        $id = (int)db()->lastInsertId();
        iniciarSesion($id);
        registrar('registro', 'usuario', $id, ['rol' => $rolPedido]);
        responder(['ok' => true, 'rol' => $rolPedido, 'csrf' => $_SESSION['csrf']], 201);

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
        ejecutar('UPDATE usuarios SET totp_secreto = ?, totp_activo = 1, totp_ultimo = ?, totp_recuperacion = ? WHERE id = ?', [
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
