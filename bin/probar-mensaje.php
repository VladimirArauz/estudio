<?php
// Manda un correo o SMS de prueba con la configuración actual.
// Uso: /opt/lampp/bin/php bin/probar-mensaje.php correo|sms destino
if (PHP_SAPI !== 'cli') exit;
require_once dirname(__DIR__) . '/config/config.php';
require_once dirname(__DIR__) . '/src/mensajes.php';

[$canal, $destino] = [$argv[1] ?? '', $argv[2] ?? ''];
if (!in_array($canal, ['correo', 'sms'], true) || $destino === '') {
    fwrite(STDERR, "Uso: php bin/probar-mensaje.php correo|sms destino\n");
    exit(2);
}
if ($canal === 'correo') {
    [$texto, $html] = correoConCodigo('Correo de prueba', '000000', 'Si te llegó este correo, el envío está bien configurado.');
    $ok = enviarCorreo($destino, 'Prueba de correo · Bátiz hasta la muerte', $texto, $html);
} else {
    $ok = enviarSms($destino, 'Prueba de SMS de Bátiz hasta la muerte: si te llegó, el envío está bien configurado.');
}
echo $ok ? "Enviado por {$canal} a {$destino}" . (!empty($CONFIG['mensajes']['simulado']) ? ' (simulado: revisa buzon.jsonl)' : '') . PHP_EOL
         : "No se pudo enviar. Revisa el registro de errores de PHP.\n";
exit($ok ? 0 : 1);
