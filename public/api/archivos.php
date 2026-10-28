<?php
// Listado, detalle, borrado y reproceso de archivos.
require_once dirname(__DIR__, 2) . '/src/comun.php';
require_once dirname(__DIR__, 2) . '/src/archivos.php';

if (metodo() === 'GET') {
    if ($id = entero($_GET['id'] ?? null)) {
        $a = uno(SQL_ARCHIVO . ' WHERE a.id = ?', [$id]);
        if (!$a || !puedeVer($a)) fallar('Archivo no encontrado.', 404);
        $datos = publico($a);
        $json = dirGenerado($a) . '/datos.json';
        $datos['vista'] = is_file($json) ? json_decode(file_get_contents($json), true) : null;
        responder(['archivo' => $datos]);
    }

    $where = [];
    $params = [];
    $seccion = $_GET['seccion'] ?? '';
    if ($seccion !== '') {
        if (!in_array($seccion, ['apuntes', 'tareas', 'examenes', 'apoyo', 'curso', 'entrega'], true)) fallar('Sección no válida.', 422);
        $where[] = 'a.seccion = ?';
        $params[] = $seccion;
    }
    foreach (['materia_id', 'curso_id', 'actividad_id'] as $campo) {
        if ($v = entero($_GET[$campo] ?? null)) { $where[] = "a.$campo = ?"; $params[] = $v; }
    }
    if (!empty($_GET['mios']) && usuario()) { $where[] = 'a.autor_id = ?'; $params[] = usuario()['id']; }
    // Los no públicos se filtran después con puedeVer().
    $sql = SQL_ARCHIVO . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY a.creado DESC, a.id DESC LIMIT 300';
    $lista = array_values(array_map('publico', array_filter(todos($sql, $params), 'puedeVer')));
    responder(['archivos' => $lista]);
}

exigirPost();
$d = entrada();
$id = entero($d['id'] ?? null) ?? fallar('Falta el archivo.', 422);
$a = uno('SELECT * FROM archivos WHERE id = ?', [$id]);
if (!$a) fallar('Archivo no encontrado.', 404);

switch (accion()) {
    case 'borrar':
        if (!puedeBorrar($a)) fallar('Solo quien lo subió (o la administración) puede eliminarlo.', 403);
        // La administración borrando lo de otra persona: confirma la contraseña.
        if ((int)$a['autor_id'] !== usuario()['id'] && esAdmin()) exigirReautenticacion();
        borrarArchivo($a);
        registrar('archivo_borrar', 'archivo', $id, ['titulo' => $a['titulo']]);
        responder(['ok' => true]);

    case 'reprocesar':
        if (!puedeBorrar($a)) fallar('No tienes permiso para reprocesar este archivo.', 403);
        borrarDir(dirGenerado($a));
        ejecutar('UPDATE archivos SET estado = "pendiente", error = NULL WHERE id = ?', [$id]);
        registrar('archivo_reprocesar', 'archivo', $id);
        responder(['ok' => true]);

    default:
        fallar('Acción no válida.', 404);
}
