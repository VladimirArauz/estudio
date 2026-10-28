<?php
// Sirve un archivo comprobando permisos:
//   modo=original  → el archivo subido (descarga, o en línea si es audio/video/imagen/pdf)
//   modo=vista     → el fragmento HTML generado por el procesador
//   modo=recurso&r → imágenes, miniaturas y medios convertidos de la vista
// Soporta peticiones Range para poder adelantar audio y video.
require_once dirname(__DIR__, 2) . '/src/comun.php';
require_once dirname(__DIR__, 2) . '/src/archivos.php';
session_write_close(); // no bloquear otras peticiones mientras se transmite
// CSP propia (el .htaccess no manda la general aquí), también en las respuestas de error.
header("Content-Security-Policy: default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");

$a = uno(SQL_ARCHIVO . ' WHERE a.id = ?', [entero($_GET['id'] ?? null) ?? 0]);
if (!$a || !puedeVer($a)) fallar('Archivo no encontrado.', 404);

$modo = $_GET['modo'] ?? 'original';
switch ($modo) {
    case 'original':
        $ruta = rutaOriginal($a);
        $tipo = $a['mime'];
        $enLinea = empty($_GET['descargar']) && preg_match('#^(audio|video|image)/|^application/pdf$#', $tipo) && $tipo !== 'image/svg+xml';
        $nombre = $a['nombre_original'];
        break;
    case 'vista':
        $ruta = dirGenerado($a) . '/contenido.html';
        $tipo = 'text/html; charset=utf-8';
        $enLinea = true;
        $nombre = 'contenido.html';
        break;
    case 'recurso':
        $r = (string)($_GET['r'] ?? '');
        if (!preg_match('#^[a-z0-9_-]+(/[a-z0-9_.-]+)?\.(png|jpg|jpeg|webp|gif|m4a|mp4|vtt|json)$#i', $r) || str_contains($r, '..')) fallar('Recurso inválido.', 400);
        $ruta = dirGenerado($a) . '/' . $r;
        $tipo = [
            'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp', 'gif' => 'image/gif',
            'm4a' => 'audio/mp4', 'mp4' => 'video/mp4', 'vtt' => 'text/vtt; charset=utf-8', 'json' => 'application/json',
        ][strtolower(pathinfo($r, PATHINFO_EXTENSION))];
        $enLinea = true;
        $nombre = basename($r);
        break;
    default:
        fallar('Modo no válido.', 400);
}
if (!is_file($ruta)) fallar('El archivo todavía no está disponible.', 404);

if ($modo === 'original' && !empty($_GET['descargar'])) registrar('archivo_descargar', 'archivo', (int)$a['id']);

$tamano = filesize($ruta);
$inicio = 0;
$fin = $tamano - 1;
header_remove('Cache-Control');
header('Cache-Control: private, max-age=3600');
header('Accept-Ranges: bytes');
header('Content-Type: ' . $tipo);
$nombreSeguro = preg_replace('/[^\w.\- ]+/u', '_', $nombre);
header(sprintf('Content-Disposition: %s; filename="%s"; filename*=UTF-8\'\'%s',
    $enLinea ? 'inline' : 'attachment', $nombreSeguro, rawurlencode($nombre)));

if (isset($_SERVER['HTTP_RANGE']) && preg_match('/bytes=(\d*)-(\d*)/', $_SERVER['HTTP_RANGE'], $m)) {
    if ($m[1] === '' && $m[2] !== '') { $inicio = max(0, $tamano - (int)$m[2]); }
    else { $inicio = (int)$m[1]; if ($m[2] !== '') $fin = min((int)$m[2], $fin); }
    if ($inicio > $fin || $inicio >= $tamano) {
        http_response_code(416);
        header("Content-Range: bytes */$tamano");
        exit;
    }
    http_response_code(206);
    header("Content-Range: bytes $inicio-$fin/$tamano");
}
header('Content-Length: ' . ($fin - $inicio + 1));

$fp = fopen($ruta, 'rb');
fseek($fp, $inicio);
$restante = $fin - $inicio + 1;
while ($restante > 0 && !feof($fp) && !connection_aborted()) {
    $bloque = fread($fp, min(65536, $restante));
    echo $bloque;
    $restante -= strlen($bloque);
    flush();
}
fclose($fp);
