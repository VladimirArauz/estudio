<?php
// Latido de analítica: una fila por página vista, con los segundos que estuvo visible.
require_once __DIR__ . '/_comun.php';

if (metodo() !== 'POST') fallar('Método no permitido.', 405);
$d = entrada();
// sendBeacon no puede enviar cabeceras, así que el token viaja en el cuerpo.
if (!hash_equals($_SESSION['csrf'], (string)($d['csrf'] ?? ''))) fallar('Token inválido.', 419);

$vista = (string)($d['vista_id'] ?? '');
if (!preg_match('/^[0-9a-f]{32}$/', $vista)) fallar('Vista inválida.', 422);
$segundos = max(0, min(86400, (int)($d['segundos'] ?? 0)));

ejecutar(
    'INSERT INTO visitas (vista_id, usuario_id, ruta, seccion, segundos) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE segundos = GREATEST(segundos, VALUES(segundos)), ultimo_latido = NOW()',
    [$vista, usuario()['id'] ?? null, texto($d, 'ruta', 255) ?? '/', texto($d, 'seccion', 60), $segundos]
);
responder(['ok' => true]);
