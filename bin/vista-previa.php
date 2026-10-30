<?php
// Escribe en cada public/*.html las etiquetas de la vista previa al compartir un enlace (Open Graph):
// título, descripción e imagen que muestran WhatsApp y las redes. Van entre <!-- vista-previa --> y <!-- /vista-previa -->.
// Con sitio.url vacío (todavía sin dominio) se omiten og:url y la dirección absoluta de la imagen, que WhatsApp necesita.
// Uso: /opt/lampp/bin/php bin/vista-previa.php   (la imagen se genera con bin/vista-previa-imagen.py)
if (PHP_SAPI !== 'cli') exit;
require_once dirname(__DIR__) . '/config/config.php';

const SITIO = 'Bátiz hasta la muerte';
const IMAGEN = 'img/vista-previa.png';
const IMAGEN_ALT = 'Bátiz hasta la muerte: apuntes, tareas, exámenes y preparación del CECyT 9 en un solo lugar.';

// archivo => [título, descripción, privada (no se indexa)]
const PAGINAS = [
    'index.html' => ['Bátiz hasta la muerte · Apuntes y exámenes del CECyT 9',
        'Encuentra apuntes, tareas y exámenes del CECyT 9 «Juan de Dios Bátiz», pide apoyo por materia y prepárate para tu examen en un solo lugar.', false],
    'login.html' => ['Entra o crea tu cuenta · Bátiz hasta la muerte',
        'Crea tu cuenta gratis para subir apuntes, inscribirte a cursos y prepararte para tus exámenes del CECyT 9.', false],
    'cursos.html' => ['Cursos del CECyT 9 · Bátiz hasta la muerte',
        'Inscríbete a los cursos de profesores del CECyT 9, entrega tus actividades y resuelve exámenes en línea.', false],
    'curso.html' => ['Curso · Bátiz hasta la muerte',
        'Material, actividades y exámenes de un curso del CECyT 9 en Bátiz hasta la muerte.', false],
    'materia.html' => ['Apoyo por materia · Bátiz hasta la muerte',
        'Apuntes, ejercicios y material de apoyo por materia del CECyT 9 para repasar antes del examen.', false],
    'preparacion.html' => ['Prepara tu examen · Bátiz hasta la muerte',
        'Practica con exámenes de tu materia del CECyT 9 y revisa tu desempeño antes del examen real.', false],
    'panel.html' => ['Panel de control · Bátiz hasta la muerte',
        'Panel de administración de Bátiz hasta la muerte: materias, archivos, cursos y cuentas del sitio.', true],
    'ver.html' => ['Archivo · Bátiz hasta la muerte',
        'Un archivo compartido en Bátiz hasta la muerte: apuntes, tareas y exámenes del CECyT 9.', true],
];

$base = rtrim($CONFIG['sitio']['url'] ?? '', '/');
$e = fn(string $s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
$dir = dirname(__DIR__) . '/public';

foreach (PAGINAS as $archivo => [$titulo, $descripcion, $privada]) {
    $ruta = "{$dir}/{$archivo}";
    $html = file_get_contents($ruta);
    $imagen = $base !== '' ? "{$base}/" . IMAGEN : IMAGEN;
    $etiquetas = [
        "<meta name=\"description\" content=\"{$e($descripcion)}\">",
        $privada ? '<meta name="robots" content="noindex">' : null,
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="' . $e(SITIO) . '">',
        '<meta property="og:locale" content="es_MX">',
        "<meta property=\"og:title\" content=\"{$e($titulo)}\">",
        "<meta property=\"og:description\" content=\"{$e($descripcion)}\">",
        $base !== '' ? '<meta property="og:url" content="' . $e($base . '/' . ($archivo === 'index.html' ? '' : $archivo)) . '">' : null,
        "<meta property=\"og:image\" content=\"{$e($imagen)}\">",
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        '<meta property="og:image:alt" content="' . $e(IMAGEN_ALT) . '">',
        '<meta name="twitter:card" content="summary_large_image">',
    ];
    $bloque = "<!-- vista-previa -->\n  " . implode("\n  ", array_filter($etiquetas)) . "\n  <!-- /vista-previa -->";

    $nuevo = preg_match('/<!-- vista-previa -->.*?<!-- \/vista-previa -->/s', $html)
        ? preg_replace('/<!-- vista-previa -->.*?<!-- \/vista-previa -->/s', $bloque, $html, 1)
        : preg_replace('/(<title>.*?<\/title>)/', "$1\n  " . str_replace('$', '\$', $bloque), $html, 1);
    if ($nuevo === null || $nuevo === $html && !str_contains($html, $bloque)) {
        fwrite(STDERR, "No se pudo actualizar {$archivo}\n");
        exit(1);
    }
    file_put_contents($ruta, $nuevo);
    echo ($nuevo === $html ? 'igual ' : 'OK    '), $archivo, PHP_EOL;
}
echo $base === '' ? "Aviso: sitio.url está vacío; falta el dominio para og:url y la imagen absoluta.\n" : '';
