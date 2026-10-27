<?php
// Comprueba que la API llega a la BD de IONOS.
require_once __DIR__ . '/_db.php';
header('Content-Type: application/json; charset=utf-8');
try {
    db()->query('SELECT 1');
    echo json_encode(['db' => 'ok']);
} catch (Throwable $e) {
    http_response_code(503);
    echo json_encode(['db' => 'error', 'mensaje' => 'No hay conexión con la base de datos. ¿Está abierto el túnel (bin/tunel.sh)?']);
}
