<?php
// Configuración general. Los secretos viven en config.local.php (no se sube a git).
$local = __DIR__ . '/config.local.php';
if (!is_file($local)) {
    http_response_code(500);
    exit('Falta config/config.local.php. Copia config.ejemplo.php y completa los datos.');
}
$CONFIG = array_replace_recursive([
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3307,          // túnel SSH hacia IONOS (bin/tunel.sh)
        'name' => '',
        'user' => '',
        'pass' => '',
    ],
    'gemini' => [
        'key' => '',
        'modelo' => 'gemini-2.5-flash-lite',
        'cache_ttl' => 604800,   // 7 días
        'limite_diario' => 60,   // peticiones por usuario al día
    ],
    'subidas' => [
        'max_bytes' => 200 * 1024 * 1024,
        'dir' => dirname(__DIR__) . '/storage',
    ],
], require $local);
