<?php
// Materias: lectura pública; altas, cambios y bajas solo para el admin.
require_once dirname(__DIR__, 2) . '/src/comun.php';

function conAsesores(array $materias): array {
    if (!$materias) return [];
    $ids = array_column($materias, 'id');
    $marcas = implode(',', array_fill(0, count($ids), '?'));
    $asesores = [];
    foreach (todos("SELECT materia_id, nombre FROM asesores WHERE materia_id IN ($marcas) ORDER BY id", $ids) as $a) {
        $asesores[$a['materia_id']][] = $a['nombre'];
    }
    foreach ($materias as &$m) {
        $m['id'] = (int)$m['id'];
        $m['archivos'] = (int)$m['archivos'];
        $m['cursos'] = (int)$m['cursos'];
        $m['asesores'] = $asesores[$m['id']] ?? [];
    }
    return $materias;
}

const SQL_MATERIAS = 'SELECT m.id, m.slug, m.nombre, m.simbolo, m.color, m.descripcion, m.area, m.orden,
    (SELECT COUNT(*) FROM archivos a WHERE a.materia_id = m.id AND a.seccion IN ("apoyo","apuntes","tareas","examenes")) archivos,
    (SELECT COUNT(*) FROM cursos c WHERE c.materia_id = m.id AND c.estado = "activo") cursos
    FROM materias m';

if (metodo() === 'GET') {
    if (!empty($_GET['slug'])) {
        $m = conAsesores(todos(SQL_MATERIAS . ' WHERE m.slug = ?', [$_GET['slug']]));
        if (!$m) fallar('Materia no encontrada.', 404);
        responder(['materia' => $m[0]]);
    }
    responder(['materias' => conAsesores(todos(SQL_MATERIAS . ' ORDER BY m.orden, m.nombre'))]);
}

exigirPost();
requiereRol('admin');
$d = entrada();

function slug(string $texto): string {
    $s = iconv('UTF-8', 'ASCII//TRANSLIT', $texto);
    $s = strtolower(trim(preg_replace('/[^A-Za-z0-9]+/', '-', $s), '-'));
    return $s ?: 'materia';
}

function guardarAsesores(int $id, $lista): void {
    if (!is_array($lista)) return;
    ejecutar('DELETE FROM asesores WHERE materia_id = ?', [$id]);
    foreach (array_slice($lista, 0, 50) as $nombre) {
        $nombre = mb_substr(trim((string)$nombre), 0, 160);
        if ($nombre !== '') ejecutar('INSERT INTO asesores (materia_id, nombre) VALUES (?, ?)', [$id, $nombre]);
    }
}

switch (accion()) {
    case 'crear':
        $nombre = texto($d, 'nombre', 120, true);
        $base = slug($nombre);
        $slug = $base;
        for ($i = 2; valor('SELECT 1 FROM materias WHERE slug = ?', [$slug]); $i++) $slug = "$base-$i";
        $orden = (int)valor('SELECT COALESCE(MAX(orden), 0) + 1 FROM materias');
        ejecutar('INSERT INTO materias (slug, nombre, simbolo, descripcion, area, orden) VALUES (?, ?, ?, ?, ?, ?)',
            [$slug, $nombre, texto($d, 'simbolo', 12) ?? mb_strtoupper(mb_substr($nombre, 0, 3)), texto($d, 'descripcion', 2000),
             texto($d, 'area', 60) ?? 'Tronco común', $orden]);
        $id = (int)db()->lastInsertId();
        guardarAsesores($id, $d['asesores'] ?? null);
        registrar('materia_crear', 'materia', $id, ['nombre' => $nombre]);
        responder(['ok' => true, 'id' => $id, 'slug' => $slug], 201);

    case 'editar':
        $id = entero($d['id'] ?? null) ?? fallar('Falta la materia.', 422);
        ejecutar('UPDATE materias SET nombre = ?, simbolo = ?, descripcion = ?, area = ?, orden = ? WHERE id = ?', [
            texto($d, 'nombre', 120, true), texto($d, 'simbolo', 12) ?? '', texto($d, 'descripcion', 2000),
            texto($d, 'area', 60) ?? 'Tronco común', (int)($d['orden'] ?? 0), $id,
        ]);
        guardarAsesores($id, $d['asesores'] ?? null);
        registrar('materia_editar', 'materia', $id);
        responder(['ok' => true]);

    case 'borrar':
        $id = entero($d['id'] ?? null) ?? fallar('Falta la materia.', 422);
        ejecutar('DELETE FROM materias WHERE id = ?', [$id]);
        registrar('materia_borrar', 'materia', $id);
        responder(['ok' => true]);

    default:
        fallar('Acción no válida.', 404);
}
