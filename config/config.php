<?php
// Configuración general. Los secretos viven en config.local.php (no se sube a git).
// Entorno: «produccion» (BD de IONOS por el túnel) o «pruebas» (BD local y storage aparte; ver tests/README.md).
// En Apache lo fija el vhost de pruebas con SetEnv; en consola, la variable ESTUDIO_ENTORNO.
$ENTORNO = (getenv('ESTUDIO_ENTORNO') ?: ($_SERVER['ESTUDIO_ENTORNO'] ?? '')) === 'pruebas' ? 'pruebas' : 'produccion';
$local = __DIR__ . ($ENTORNO === 'pruebas' ? '/config.pruebas.php' : '/config.local.php');
if (!is_file($local)) {
    http_response_code(500);
    exit('Falta config/' . basename($local) . '. Copia config.ejemplo.php y completa los datos.');
}
$CONFIG = array_replace_recursive([
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3307,          // túnel SSH hacia IONOS (bin/tunel.sh)
        'name' => '',
        'user' => '',
        'pass' => '',
    ],
    'sesion' => [
        'nombre' => 'BATIZ',
        'inactividad' => 1800,      // 30 min sin actividad cierran la sesión
        'maxima' => 43200,          // 12 h como máximo
        'maxima_admin' => 7200,     // 2 h para admin
    ],
    'app_key' => '',                // 32 bytes en base64: cifra los secretos de 2FA (config.local.php)
    'gemini' => [
        'key' => '',
        'simulado' => false,        // pruebas: respuestas fijas sin llamar a Gemini
        'modelo' => 'gemini-3.5-flash-lite',
        'cache_ttl' => 604800,   // 7 días
        'limite_diario' => 60,   // peticiones por usuario al día
    ],
    'mensajes' => [
        'simulado' => false,        // pruebas: no envía nada, escribe en <storage>/buzon.jsonl
        'smtp' => [                 // buzón de IONOS (config.local.php)
            'host' => 'smtp.ionos.mx',
            'port' => 587,          // STARTTLS
            'user' => '',
            'pass' => '',
            'de' => '',             // remitente; vacío = el mismo usuario
            'de_nombre' => 'Bátiz hasta la muerte',
        ],
        'twilio' => ['sid' => '', 'token' => '', 'de' => ''],  // sin sid no se ofrece SMS
    ],
    'subidas' => [
        'max_bytes' => 200 * 1024 * 1024,
        'dir' => dirname(__DIR__) . '/storage',
    ],
], require $local);

// Las pruebas nunca deben tocar la BD de producción (el túnel a IONOS escucha en 3307).
if ($ENTORNO === 'pruebas' && (int)$CONFIG['db']['port'] === 3307) {
    http_response_code(500);
    exit('El entorno de pruebas apunta al túnel de producción. Revisa config/config.pruebas.php.');
}
// Ni las pruebas deben mandar correos o SMS reales.
if ($ENTORNO === 'pruebas') $CONFIG['mensajes']['simulado'] = true;
