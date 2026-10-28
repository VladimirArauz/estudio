<?php
// Recibe un archivo, lo valida y lo deja en cola para que procesador/worker.py genere su vista HTML.
require_once __DIR__ . '/_comun.php';
require_once __DIR__ . '/_archivos.php';

exigirPost();
$u = requiereRol('alumno', 'profesor', 'admin');

$f = $_FILES['archivo'] ?? null;
if (!$f || is_array($f['name'])) fallar('Envía un archivo en el campo «archivo».', 422);
if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE) fallar('El archivo pesa más de 200 MB. Comprímelo o divídelo.', 413);
if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) fallar('La subida no se completó. Intenta de nuevo.', 400);
if ($f['size'] > $CONFIG['subidas']['max_bytes']) fallar('El archivo pesa más de 200 MB. Comprímelo o divídelo.', 413);
if ($f['size'] === 0) fallar('El archivo está vacío.', 422);

// Extensión: solo la última, y debe estar en la lista blanca.
$nombre = mb_substr(basename(str_replace('\\', '/', $f['name'])), 0, 255);
$ext = strtolower(pathinfo($nombre, PATHINFO_EXTENSION));
if (!isset(TIPOS_PERMITIDOS[$ext])) fallar("No aceptamos archivos .{$ext}. Sube PDF, Word, PowerPoint, Excel, texto, imagen, audio o video.", 415);
[$tipo, $mimesValidos] = TIPOS_PERMITIDOS[$ext];

// El contenido real debe coincidir con la extensión.
$mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']) ?: 'application/octet-stream';
$coincide = false;
foreach ($mimesValidos as $prefijo) if (str_starts_with($mime, $prefijo)) $coincide = true;
if (!$coincide) fallar("El contenido del archivo ({$mime}) no corresponde a un .{$ext}.", 415);

// Sección y a qué pertenece.
$d = $_POST;
$seccion = $d['seccion'] ?? '';
$materia = entero($d['materia_id'] ?? null);
$curso = entero($d['curso_id'] ?? null);
$actividad = entero($d['actividad_id'] ?? null);
$areaExamen = null;

switch ($seccion) {
    case 'apuntes': case 'tareas': case 'examenes': case 'apoyo':
        $curso = $actividad = null;
        if ($seccion === 'apoyo' && !$materia) fallar('Elige la materia del material de apoyo.', 422);
        break;
    case 'curso':
        if (!$curso || !esProfesorDe($curso)) fallar('Solo el profesor del curso puede subir material aquí.', 403);
        $materia = (int)valor('SELECT materia_id FROM cursos WHERE id = ?', [$curso]);
        $actividad = null;
        break;
    case 'entrega':
        $act = $actividad ? uno('SELECT id, curso_id FROM actividades WHERE id = ?', [$actividad]) : null;
        if (!$act) fallar('La actividad no existe.', 404);
        $curso = (int)$act['curso_id'];
        if (!estaInscrito($curso)) fallar('Solo los alumnos inscritos pueden entregar esta actividad.', 403);
        $materia = (int)valor('SELECT materia_id FROM cursos WHERE id = ?', [$curso]);
        break;
    case 'guia':
        // Manuales y guías para el examen de admisión: los usa api/ia.php al generar exámenes.
        if ($u['rol'] !== 'admin') fallar('Solo la administración puede subir guías de examen.', 403);
        if (!in_array($tipo, TIPOS_GUIA, true)) fallar('Las guías deben ser PDF, Word, PowerPoint, Excel o texto para poder leerlas.', 415);
        $areaExamen = $d['area_examen'] ?? '';
        if ($areaExamen === '') $areaExamen = null;
        elseif (!in_array($areaExamen, TEMARIO_EXAMEN, true)) fallar('Materia del examen no válida.', 422);
        $materia = $curso = $actividad = null;
        break;
    default:
        fallar('Sección no válida.', 422);
}
if ($materia && !valor('SELECT 1 FROM materias WHERE id = ?', [$materia])) fallar('La materia no existe.', 404);

$uuid = bin2hex(random_bytes(16));
$destino = $CONFIG['subidas']['dir'] . "/originales/{$uuid}.{$ext}";
if (!move_uploaded_file($f['tmp_name'], $destino)) fallar('No se pudo guardar el archivo en el servidor.', 500);
chmod($destino, 0664);

$titulo = texto($d, 'titulo', 200) ?? pathinfo($nombre, PATHINFO_FILENAME);
ejecutar('INSERT INTO archivos (uuid, seccion, materia_id, curso_id, actividad_id, area_examen, autor_id, titulo, nombre_original, extension, mime, tipo, bytes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [$uuid, $seccion, $materia, $curso, $actividad, $areaExamen, $u['id'], $titulo, $nombre, $ext, $mime, $tipo, $f['size']]);
$id = (int)db()->lastInsertId();

// Una entrega por alumno y actividad: se reemplaza el archivo anterior.
if ($seccion === 'entrega') {
    $previa = uno('SELECT e.id, e.archivo_id FROM entregas e WHERE e.actividad_id = ? AND e.alumno_id = ?', [$actividad, $u['id']]);
    if ($previa) {
        ejecutar('UPDATE entregas SET archivo_id = ?, entregado = NOW(), comentario_alumno = COALESCE(?, comentario_alumno) WHERE id = ?',
            [$id, texto($d, 'comentario', 2000), $previa['id']]);
        if ($previa['archivo_id'] && ($viejo = uno('SELECT * FROM archivos WHERE id = ?', [$previa['archivo_id']]))) borrarArchivo($viejo);
    } else {
        ejecutar('INSERT INTO entregas (actividad_id, alumno_id, archivo_id, comentario_alumno) VALUES (?, ?, ?, ?)',
            [$actividad, $u['id'], $id, texto($d, 'comentario', 2000)]);
    }
}

registrar('archivo_subir', 'archivo', $id, ['seccion' => $seccion, 'tipo' => $tipo, 'bytes' => $f['size']]);
responder(['archivo' => publico(uno(SQL_ARCHIVO . ' WHERE a.id = ?', [$id]))], 201);
