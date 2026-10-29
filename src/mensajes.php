<?php
// Envío de correos (SMTP de IONOS con STARTTLS) y SMS (API REST de Twilio).
// Con mensajes.simulado (entorno de pruebas) no sale nada: cada mensaje se agrega a <storage>/buzon.jsonl.
// Nunca se registra el texto del mensaje (lleva el código); solo el canal y el error del proveedor.

function enviarCorreo(string $para, string $asunto, string $texto, string $html): bool {
    global $CONFIG;
    $c = $CONFIG['mensajes'];
    if (!empty($c['simulado'])) return guardarEnBuzon('correo', $para, $texto);
    $s = $c['smtp'];
    if (($s['host'] ?? '') === '' || ($s['user'] ?? '') === '') return falloEnvio('correo', 'SMTP sin configurar');
    // Evita inyección de cabeceras: ni el destino ni el asunto pueden traer saltos de línea.
    if (!filter_var($para, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $asunto)) return falloEnvio('correo', 'destino o asunto inválido');

    $de = $s['de'] ?: $s['user'];
    $limite = 'b' . bin2hex(random_bytes(12));
    $mensaje = implode("\r\n", [
        'Date: ' . date(DATE_RFC2822),
        'From: ' . mb_encode_mimeheader($s['de_nombre'] ?? 'Bátiz hasta la muerte', 'UTF-8') . " <{$de}>",
        "To: <{$para}>",
        'Subject: ' . mb_encode_mimeheader($asunto, 'UTF-8'),
        'Message-ID: <' . bin2hex(random_bytes(16)) . '@' . substr(strrchr($de, '@'), 1) . '>',
        'MIME-Version: 1.0',
        "Content-Type: multipart/alternative; boundary=\"{$limite}\"",
        '',
        "--{$limite}",
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        chunk_split(base64_encode($texto)),
        "--{$limite}",
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        chunk_split(base64_encode($html)),
        "--{$limite}--",
        '',
    ]);

    $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'peer_name' => $s['host']]]);
    $sock = @stream_socket_client("tcp://{$s['host']}:{$s['port']}", $errno, $errstr, 10, STREAM_CLIENT_CONNECT, $ctx);
    if (!$sock) return falloEnvio('correo', "no se pudo conectar ({$errstr})");
    stream_set_timeout($sock, 15);
    try {
        $hola = 'EHLO ' . (gethostname() ?: 'localhost');
        smtp($sock, null, 220);
        smtp($sock, $hola, 250);
        smtp($sock, 'STARTTLS', 220);
        if (!stream_socket_enable_crypto($sock, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT)) {
            throw new RuntimeException('no se pudo iniciar TLS');
        }
        smtp($sock, $hola, 250);
        smtp($sock, 'AUTH LOGIN', 334);
        smtp($sock, base64_encode($s['user']), 334);
        smtp($sock, base64_encode($s['pass']), 235);
        smtp($sock, "MAIL FROM:<{$de}>", 250);
        smtp($sock, "RCPT TO:<{$para}>", 250);
        smtp($sock, 'DATA', 354);
        // El cuerpo va en base64: ninguna línea empieza con «.», así que no hace falta duplicar puntos.
        smtp($sock, $mensaje . "\r\n.", 250);
        smtp($sock, 'QUIT', 221);
        return true;
    } catch (RuntimeException $e) {
        return falloEnvio('correo', $e->getMessage());
    } finally {
        fclose($sock);
    }
}

// Manda una línea (si hay) y lee la respuesta completa (las líneas «250-…» continúan, «250 …» termina).
function smtp($sock, ?string $linea, int $esperado): void {
    if ($linea !== null) fwrite($sock, $linea . "\r\n");
    $respuesta = '';
    while (($l = fgets($sock, 1024)) !== false) {
        $respuesta .= $l;
        if (strlen($l) < 4 || $l[3] === ' ') break;
    }
    if ((int)substr($respuesta, 0, 3) !== $esperado) {
        // Sin el comando enviado: puede llevar la contraseña en base64.
        throw new RuntimeException('SMTP respondió ' . trim(substr($respuesta, 0, 120)));
    }
}

function enviarSms(string $telefono, string $texto): bool {
    global $CONFIG;
    $c = $CONFIG['mensajes'];
    if (!empty($c['simulado'])) return guardarEnBuzon('sms', $telefono, $texto);
    $t = $c['twilio'];
    if (!smsDisponible()) return falloEnvio('sms', 'Twilio sin configurar');
    if (!preg_match('/^\+[1-9]\d{7,14}$/', $telefono)) return falloEnvio('sms', 'teléfono inválido');

    $ctx = stream_context_create(['http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/x-www-form-urlencoded\r\nAuthorization: Basic " . base64_encode("{$t['sid']}:{$t['token']}") . "\r\n",
        'content' => http_build_query(['To' => $telefono, 'From' => $t['de'], 'Body' => $texto]),
        'timeout' => 10,
        'ignore_errors' => true,
    ]]);
    $url = 'https://api.twilio.com/2010-04-01/Accounts/' . rawurlencode($t['sid']) . '/Messages.json';
    $respuesta = @file_get_contents($url, false, $ctx);
    if ($respuesta === false) return falloEnvio('sms', 'no se pudo conectar con Twilio');
    $estado = 0;
    foreach ($http_response_header ?? [] as $h) if (preg_match('#^HTTP/\S+\s+(\d{3})#', $h, $m)) $estado = (int)$m[1];
    if ($estado !== 201) {
        $d = json_decode($respuesta, true) ?: [];
        return falloEnvio('sms', "Twilio {$estado} " . ($d['code'] ?? '') . ' ' . mb_substr($d['message'] ?? '', 0, 120));
    }
    return true;
}

// El SMS solo se ofrece si hay credenciales (o en pruebas, con el buzón simulado).
function smsDisponible(): bool {
    global $CONFIG;
    $c = $CONFIG['mensajes'];
    return !empty($c['simulado']) || (($c['twilio']['sid'] ?? '') !== '' && ($c['twilio']['token'] ?? '') !== '' && ($c['twilio']['de'] ?? '') !== '');
}

function guardarEnBuzon(string $canal, string $destino, string $texto): bool {
    global $CONFIG;
    $linea = json_encode(['fecha' => date('c'), 'canal' => $canal, 'destino' => $destino, 'texto' => $texto], JSON_UNESCAPED_UNICODE);
    return file_put_contents($CONFIG['subidas']['dir'] . '/buzon.jsonl', $linea . "\n", FILE_APPEND | LOCK_EX) !== false;
}

function falloEnvio(string $canal, string $motivo): bool {
    error_log("[estudio] Envío por {$canal} falló: {$motivo}");
    if (function_exists('registrar')) registrar('envio_fallido', $canal, null, ['motivo' => mb_substr($motivo, 0, 200)]);
    return false;
}

// Correo con el código: texto plano y HTML sencillo con los colores del sitio (sin imágenes remotas).
function correoConCodigo(string $titulo, string $codigo, string $explicacion): array {
    $texto = "{$titulo}\n\nTu código es: {$codigo}\n\n{$explicacion}\n\nCaduca en 10 minutos. Si no lo pediste, ignora este correo.\n\n— Bátiz hasta la muerte";
    $e = fn($s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    $html = '<!DOCTYPE html><html lang="es"><body style="margin:0;padding:24px;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;color:#1d2433">'
        . '<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #c9c2b2;padding:28px">'
        . '<p style="margin:0 0 4px;font:600 11px/1.4 monospace;letter-spacing:.12em;text-transform:uppercase;color:#6b6457">Bátiz hasta la muerte</p>'
        . '<h1 style="margin:0 0 16px;font-size:22px">' . $e($titulo) . '</h1>'
        . '<p style="margin:0 0 8px">Tu código es:</p>'
        . '<p style="margin:0 0 16px;font:700 32px/1.2 monospace;letter-spacing:.3em;color:#14365f">' . $e($codigo) . '</p>'
        . '<p style="margin:0 0 16px">' . $e($explicacion) . '</p>'
        . '<p style="margin:0;font-size:13px;color:#6b6457">Caduca en 10 minutos. Si no lo pediste, ignora este correo.</p>'
        . '</div></body></html>';
    return [$texto, $html];
}
