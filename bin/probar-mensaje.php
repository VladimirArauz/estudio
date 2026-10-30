<?php
// Manda un correo de prueba con la configuración actual.
// Uso: /opt/lampp/bin/php bin/probar-mensaje.php destino@correo.com
if (PHP_SAPI !== 'cli') exit;
require_once dirname(__DIR__) . '/config/config.php';
require_once dirname(__DIR__) . '/src/mensajes.php';

$destino = $argv[1] ?? '';
if ($destino === '') {
    fwrite(STDERR, "Uso: php bin/probar-mensaje.php destino@correo.com\n");
    exit(2);
}
[$texto, $html] = correoConCodigo('Correo de prueba', '000000', 'Si te llegó este correo, el envío está bien configurado.');
$ok = enviarCorreo($destino, 'Prueba de correo · Bátiz hasta la muerte', $texto, $html);
echo $ok ? "Enviado a {$destino}" . (!empty($CONFIG['mensajes']['simulado']) ? ' (simulado: revisa buzon.jsonl)' : '') . PHP_EOL
         : "No se pudo enviar. Revisa el registro de errores de PHP.\n";
exit($ok ? 0 : 1);
