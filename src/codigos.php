<?php
// Códigos de verificación de 6 dígitos por correo o SMS: verificar el contacto, segundo paso al entrar
// y recuperar la contraseña. Se guarda solo su HMAC con app_key; caducan a los 10 min, se usan una vez
// y cada uno acepta 5 intentos. Requiere comun.php, totp.php (llaveApp) y mensajes.php.

const CODIGO_VIGENCIA = 600;  // 10 min
const CODIGO_INTENTOS = 5;
const CODIGO_ESPERA = 60;     // entre un envío y el siguiente del mismo propósito

const CODIGO_TEXTOS = [
    'verificar_correo' => ['Verifica tu correo', 'Escríbelo en la página para confirmar que este correo es tuyo.'],
    'verificar_telefono' => ['Verifica tu teléfono', 'Escríbelo en la página para confirmar que este teléfono es tuyo.'],
    'login' => ['Código para iniciar sesión', 'Alguien escribió bien tu contraseña. Si fuiste tú, escribe este código para terminar de entrar.'],
    'recuperar' => ['Código para restablecer tu contraseña', 'Escríbelo en la página junto con tu contraseña nueva.'],
];

// Genera y envía un código nuevo (invalida los anteriores del mismo propósito).
// Con $silencioso no corta la petición por espera, límite o fallo de envío: devuelve null
// (la recuperación de contraseña responde igual exista o no la cuenta).
function emitirCodigo(int $uid, string $proposito, string $canal, string $destino, bool $silencioso = false): ?array {
    $no = function (string $mensaje, int $estado, array $extra = []) use ($silencioso) {
        if ($silencioso) return null;
        responder(['error' => $mensaje] + $extra, $estado);
    };

    $ultimo = valor('SELECT TIMESTAMPDIFF(SECOND, MAX(creado), NOW()) FROM codigos_verificacion WHERE usuario_id = ? AND proposito = ?', [$uid, $proposito]);
    if ($ultimo !== null && $ultimo !== false && (int)$ultimo < CODIGO_ESPERA) {
        $faltan = CODIGO_ESPERA - (int)$ultimo;
        return $no("Espera {$faltan} segundos para pedir otro código.", 429, ['reenviar_en' => $faltan]);
    }
    // El SMS cuesta: tope más bajo por cuenta. Por conexión, un tope para todos los envíos.
    $topes = $canal === 'sms'
        ? [["codigo-sms:{$uid}", 3, 3600], ["codigo-sms-dia:{$uid}", 10, 86400]]
        : [["codigo-correo:{$uid}", 5, 3600]];
    $topes[] = ['codigo-ip:' . ip(), 20, 3600];
    foreach ($topes as [$clave, $max, $segundos]) {
        if (excedeLimite($clave, $max, $segundos)) return $no('Pediste demasiados códigos. Espera un rato e intenta de nuevo.', 429);
    }

    $codigo = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    ejecutar('UPDATE codigos_verificacion SET expira = NOW() WHERE usuario_id = ? AND proposito = ? AND usado IS NULL AND expira > NOW()', [$uid, $proposito]);
    ejecutar('INSERT INTO codigos_verificacion (usuario_id, proposito, canal, destino, codigo_hash, expira, ip)
              VALUES (?, ?, ?, ?, ?, NOW() + INTERVAL ? SECOND, ?)',
        [$uid, $proposito, $canal, $destino, hashCodigo($uid, $proposito, $codigo), CODIGO_VIGENCIA, ip()]);
    $id = (int)db()->lastInsertId();

    [$titulo, $explicacion] = CODIGO_TEXTOS[$proposito];
    if ($canal === 'sms') {
        $ok = enviarSms($destino, "Tu código de Bátiz hasta la muerte es {$codigo}. Caduca en 10 minutos. Si no lo pediste, ignora este mensaje.");
    } else {
        [$texto, $html] = correoConCodigo($titulo, $codigo, $explicacion);
        $ok = enviarCorreo($destino, "{$codigo} es tu código · Bátiz hasta la muerte", $texto, $html);
    }
    if (!$ok) {
        ejecutar('UPDATE codigos_verificacion SET expira = NOW() WHERE id = ?', [$id]);
        return $no('No pudimos enviar el código. Intenta de nuevo en un momento' . ($canal === 'sms' ? ' o usa tu correo.' : '.'), 502);
    }
    registrar('codigo_enviado', 'usuario', $uid, ['proposito' => $proposito, 'canal' => $canal]);
    if (random_int(1, 100) === 1) ejecutar('DELETE FROM codigos_verificacion WHERE expira < NOW() - INTERVAL 7 DAY');
    return ['canal' => $canal, 'destino' => enmascarar($canal, $destino), 'reenviar_en' => CODIGO_ESPERA];
}

// Consume el código vigente si coincide. Devuelve la fila (canal y destino al que se mandó) o null.
// El intento se cuenta antes de comparar y de forma atómica: dos peticiones a la vez no ganan intentos extra.
function verificarCodigo(int $uid, string $proposito, string $codigo): ?array {
    $f = uno('SELECT id, canal, destino, codigo_hash FROM codigos_verificacion
              WHERE usuario_id = ? AND proposito = ? AND usado IS NULL AND expira > NOW() ORDER BY id DESC LIMIT 1', [$uid, $proposito]);
    if (!$f) return null;
    if (ejecutar('UPDATE codigos_verificacion SET intentos = intentos + 1 WHERE id = ? AND intentos < ?', [$f['id'], CODIGO_INTENTOS]) !== 1) return null;
    $codigo = preg_replace('/\D/', '', $codigo);
    if (!hash_equals($f['codigo_hash'], hashCodigo($uid, $proposito, $codigo))) {
        ejecutar('UPDATE codigos_verificacion SET expira = NOW() WHERE id = ? AND intentos >= ?', [$f['id'], CODIGO_INTENTOS]);
        return null;
    }
    if (ejecutar('UPDATE codigos_verificacion SET usado = NOW() WHERE id = ? AND usado IS NULL AND expira > NOW()', [$f['id']]) !== 1) return null;
    return ['canal' => $f['canal'], 'destino' => $f['destino']];
}

function hashCodigo(int $uid, string $proposito, string $codigo): string {
    return hash_hmac('sha256', "{$uid}|{$proposito}|{$codigo}", llaveApp());
}

// a•••@gmail.com · •••• 5678
function enmascarar(string $canal, ?string $destino): ?string {
    if ($destino === null || $destino === '') return null;
    if ($canal === 'sms') return '•••• ' . substr($destino, -4);
    [$nombre, $dominio] = explode('@', $destino, 2) + [1 => ''];
    return mb_substr($nombre, 0, 1) . '•••@' . $dominio;
}

// 10 dígitos → México (+52). Con «+», E.164 de cualquier país (8 a 15 dígitos). Si no, null.
function normalizarTelefono(string $telefono): ?string {
    $limpio = preg_replace('/[\s().-]/', '', $telefono);
    if (preg_match('/^\d{10}$/', $limpio)) return '+52' . $limpio;
    if (preg_match('/^\+[1-9]\d{7,14}$/', $limpio)) return $limpio;
    return null;
}
