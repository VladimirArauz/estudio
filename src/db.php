<?php
// Conexión PDO compartida. Requiere el túnel abierto (bin/tunel.sh).
require_once dirname(__DIR__) . '/config/config.php';

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    global $CONFIG;
    $c = $CONFIG['db'];
    $dsn = "mysql:host={$c['host']};port={$c['port']};dbname={$c['name']};charset=utf8mb4";
    // La BD está en IONOS (~230 ms de ida y vuelta por el túnel), así que:
    // - conexión persistente: PHP-FPM la reutiliza y no paga ~1 s de conexión por petición;
    // - prepares emulados: 1 viaje por consulta en vez de 2 (los valores se siguen escapando con utf8mb4).
    $pdo = new PDO($dsn, $c['user'], $c['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => true,
        PDO::ATTR_PERSISTENT => PHP_SAPI !== 'cli',
        PDO::ATTR_TIMEOUT => 5,
    ]);
    $pdo->exec("SET time_zone = '-06:00'");
    return $pdo;
}
