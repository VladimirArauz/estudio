<?php
// Reglas compartidas sobre archivos: tipos permitidos y quién puede verlos o borrarlos.

// extensión => [tipo, prefijos MIME aceptados según finfo]
const TIPOS_PERMITIDOS = [
    'pdf'  => ['pdf', ['application/pdf']],
    'doc'  => ['documento', ['application/msword', 'application/vnd.ms-office', 'application/x-ole-storage', 'application/CDFV2']],
    'docx' => ['documento', ['application/vnd.openxmlformats-officedocument.wordprocessingml', 'application/zip', 'application/octet-stream']],
    'odt'  => ['documento', ['application/vnd.oasis.opendocument.text', 'application/zip']],
    'rtf'  => ['documento', ['text/rtf', 'application/rtf', 'text/plain']],
    'ppt'  => ['presentacion', ['application/vnd.ms-powerpoint', 'application/vnd.ms-office', 'application/x-ole-storage', 'application/CDFV2']],
    'pptx' => ['presentacion', ['application/vnd.openxmlformats-officedocument.presentationml', 'application/zip', 'application/octet-stream']],
    'odp'  => ['presentacion', ['application/vnd.oasis.opendocument.presentation', 'application/zip']],
    'xls'  => ['hoja', ['application/vnd.ms-excel', 'application/vnd.ms-office', 'application/x-ole-storage', 'application/CDFV2']],
    'xlsx' => ['hoja', ['application/vnd.openxmlformats-officedocument.spreadsheetml', 'application/zip', 'application/octet-stream']],
    'ods'  => ['hoja', ['application/vnd.oasis.opendocument.spreadsheet', 'application/zip']],
    'csv'  => ['hoja', ['text/', 'application/csv']],
    'txt'  => ['texto', ['text/', 'application/x-empty']],
    'md'   => ['texto', ['text/']],
    'py'   => ['texto', ['text/']], 'js' => ['texto', ['text/', 'application/javascript']], 'java' => ['texto', ['text/']],
    'c'    => ['texto', ['text/']], 'cpp' => ['texto', ['text/']], 'html' => ['texto', ['text/']], 'css' => ['texto', ['text/']],
    'json' => ['texto', ['text/', 'application/json']], 'sql' => ['texto', ['text/', 'application/sql']],
    'png'  => ['imagen', ['image/png']], 'jpg' => ['imagen', ['image/jpeg']], 'jpeg' => ['imagen', ['image/jpeg']],
    'gif'  => ['imagen', ['image/gif']], 'webp' => ['imagen', ['image/webp']], 'bmp' => ['imagen', ['image/bmp', 'image/x-ms-bmp']],
    'mp3'  => ['audio', ['audio/']], 'wav' => ['audio', ['audio/']], 'ogg' => ['audio', ['audio/', 'video/ogg', 'application/ogg']],
    'm4a'  => ['audio', ['audio/', 'video/mp4']], 'aac' => ['audio', ['audio/']], 'flac' => ['audio', ['audio/']],
    'opus' => ['audio', ['audio/', 'application/ogg']],
    'mp4'  => ['video', ['video/']], 'webm' => ['video', ['video/', 'audio/webm']], 'mov' => ['video', ['video/']],
    'mkv'  => ['video', ['video/', 'application/x-matroska']], 'avi' => ['video', ['video/', 'application/x-msvideo']],
    'm4v'  => ['video', ['video/']],
    'zip'  => ['otro', ['application/zip']],
];

const SECCIONES_PUBLICAS = ['apuntes', 'tareas', 'examenes', 'apoyo'];

// Materias del examen de admisión al nivel superior (el generador de Preparación y las guías usan las mismas).
const TEMARIO_EXAMEN = ['Matemáticas', 'Física', 'Química', 'Biología', 'Historia', 'Comunicación', 'Inglés'];
// Las guías de examen solo sirven si se les puede sacar texto.
const TIPOS_GUIA = ['pdf', 'documento', 'presentacion', 'hoja', 'texto'];

// Texto extraído de una guía (lo escribe procesador/worker.py); '' si aún no se procesa.
function textoGuia(array $a): string {
    $ruta = dirGenerado($a) . '/texto.txt';
    return is_file($ruta) ? (string)file_get_contents($ruta) : '';
}

function rutaOriginal(array $a): string {
    global $CONFIG;
    return $CONFIG['subidas']['dir'] . '/originales/' . $a['uuid'] . ($a['extension'] ? '.' . $a['extension'] : '');
}

function dirGenerado(array $a): string {
    global $CONFIG;
    return $CONFIG['subidas']['dir'] . '/generados/' . $a['uuid'];
}

// ¿El usuario actual puede ver este archivo?
function puedeVer(array $a): bool {
    if (in_array($a['seccion'], SECCIONES_PUBLICAS, true)) return true;
    $u = usuario();
    if (!$u) return false;
    if ($u['rol'] === 'admin' || (int)$a['autor_id'] === $u['id']) return true;
    if ($a['seccion'] === 'curso') return esProfesorDe((int)$a['curso_id']) || estaInscrito((int)$a['curso_id']);
    if ($a['seccion'] === 'entrega') {
        $curso = valor('SELECT curso_id FROM actividades WHERE id = ?', [$a['actividad_id']]);
        return $curso && esProfesorDe((int)$curso);
    }
    return false;
}

function puedeBorrar(array $a): bool {
    $u = usuario();
    if (!$u) return false;
    if ($u['rol'] === 'admin' || (int)$a['autor_id'] === $u['id']) return true;
    return $a['seccion'] === 'curso' && esProfesorDe((int)$a['curso_id']);
}

function borrarDir(string $dir): void {
    if (!is_dir($dir)) return;
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $f) {
        $f->isDir() ? rmdir($f->getPathname()) : unlink($f->getPathname());
    }
    rmdir($dir);
}

function borrarArchivo(array $a): void {
    ejecutar('DELETE FROM archivos WHERE id = ?', [$a['id']]);
    @unlink(rutaOriginal($a));
    borrarDir(dirGenerado($a));
}

const SQL_ARCHIVO = 'SELECT a.*, u.nombre autor, m.nombre materia
    FROM archivos a LEFT JOIN usuarios u ON u.id = a.autor_id LEFT JOIN materias m ON m.id = a.materia_id';

function publico(array $a): array {
    return [
        'id' => (int)$a['id'], 'seccion' => $a['seccion'], 'titulo' => $a['titulo'], 'nombre_original' => $a['nombre_original'],
        'tipo' => $a['tipo'], 'mime' => $a['mime'], 'bytes' => (int)$a['bytes'], 'estado' => $a['estado'], 'error' => $a['error'],
        'resumen' => $a['resumen'], 'creado' => $a['creado'], 'procesado' => $a['procesado'],
        'autor' => $a['autor'], 'autor_id' => $a['autor_id'] ? (int)$a['autor_id'] : null,
        'materia' => $a['materia'], 'materia_id' => $a['materia_id'] ? (int)$a['materia_id'] : null,
        'curso_id' => $a['curso_id'] ? (int)$a['curso_id'] : null, 'actividad_id' => $a['actividad_id'] ? (int)$a['actividad_id'] : null,
        'puede_borrar' => puedeBorrar($a),
    ];
}
