<?php
// Classroom: postulaciones, cursos, inscripciones, actividades, entregas, exámenes de curso,
// evaluaciones y estadísticas.
require_once dirname(__DIR__, 2) . '/src/comun.php';
require_once dirname(__DIR__, 2) . '/src/archivos.php';

function curso(int $id): array {
    $c = uno('SELECT c.*, m.nombre materia, m.slug materia_slug, u.nombre profesor
              FROM cursos c JOIN materias m ON m.id = c.materia_id JOIN usuarios u ON u.id = c.profesor_id WHERE c.id = ?', [$id]);
    if (!$c) fallar('Curso no encontrado.', 404);
    return $c;
}

function exigirProfesor(int $cursoId): void {
    if (!esProfesorDe($cursoId)) fallar('Solo el profesor del curso puede hacer esto.', 403);
}

function exigirAcceso(int $cursoId): void {
    if (!esProfesorDe($cursoId) && !estaInscrito($cursoId)) fallar('Inscríbete al curso para ver esto.', 403);
}

function postulacionAprobada(int $usuario, int $materia): bool {
    return (bool)valor('SELECT 1 FROM postulaciones_profesor WHERE usuario_id = ? AND materia_id = ? AND estado = "aprobada"', [$usuario, $materia]);
}

// Preguntas sin respuestas: lo que ve el alumno antes de resolver.
function sinRespuestas(array $preguntas): array {
    return array_map(fn($p) => ['pregunta' => $p['pregunta'], 'opciones' => $p['opciones'], 'tema' => $p['tema'] ?? ''], $preguntas);
}

const SQL_CURSOS = 'SELECT c.id, c.titulo, c.descripcion, c.estado, c.creado, c.materia_id, m.nombre materia, m.slug materia_slug,
    c.profesor_id, u.nombre profesor,
    (SELECT COUNT(*) FROM inscripciones i WHERE i.curso_id = c.id) alumnos,
    (SELECT AVG((e.estrellas_curso + e.estrellas_profesor) / 2) FROM evaluaciones_curso e WHERE e.curso_id = c.id) calificacion
    FROM cursos c JOIN materias m ON m.id = c.materia_id JOIN usuarios u ON u.id = c.profesor_id';

/* ───────────────────────── GET ───────────────────────── */
if (metodo() === 'GET') {
    $u = usuario();

    if ($materia = entero($_GET['materia_id'] ?? null)) {
        $cursos = todos(SQL_CURSOS . ' WHERE c.materia_id = ? AND c.estado = "activo" ORDER BY c.creado DESC', [$materia]);
        foreach ($cursos as &$c) {
            $c['inscrito'] = $u && estaInscrito((int)$c['id']);
            $c['es_mio'] = $u && (int)$c['profesor_id'] === $u['id'];
        }
        $post = $u ? valor('SELECT estado FROM postulaciones_profesor WHERE usuario_id = ? AND materia_id = ?', [$u['id'], $materia]) : null;
        responder(['cursos' => $cursos, 'postulacion' => $post ?: null]);
    }

    if (!empty($_GET['mios'])) {
        $u = requiereRol('alumno', 'profesor', 'admin');
        if ($u['rol'] === 'alumno') {
            $cursos = todos(SQL_CURSOS . ' JOIN inscripciones i ON i.curso_id = c.id AND i.alumno_id = ? ORDER BY i.creado DESC', [$u['id']]);
        } else {
            $cursos = todos(SQL_CURSOS . (esAdmin() && !empty($_GET['todos']) ? '' : ' WHERE c.profesor_id = ' . $u['id']) . ' ORDER BY c.creado DESC');
            // Visitas por curso para «cuáles son más visitados».
            foreach ($cursos as &$c) {
                $c['visitas'] = (int)valor('SELECT COUNT(*) FROM visitas WHERE ruta = ?', ['curso.html?id=' . $c['id']]);
            }
        }
        $postulaciones = $u['rol'] === 'profesor'
            ? todos('SELECT p.id, p.estado, p.creado, m.nombre materia, m.slug FROM postulaciones_profesor p JOIN materias m ON m.id = p.materia_id WHERE p.usuario_id = ? ORDER BY p.creado DESC', [$u['id']])
            : [];
        responder(['cursos' => $cursos, 'postulaciones' => $postulaciones]);
    }

    $id = entero($_GET['id'] ?? null) ?? fallar('Falta el curso.', 422);
    // Una sola consulta con todo lo que define el acceso (cada viaje a la BD cuesta ~150 ms).
    $uid = $u['id'] ?? 0;
    $c = uno('SELECT c.*, m.nombre materia, m.slug materia_slug, u.nombre profesor,
        (SELECT COUNT(*) FROM inscripciones i WHERE i.curso_id = c.id) alumnos,
        (SELECT AVG((e.estrellas_curso + e.estrellas_profesor) / 2) FROM evaluaciones_curso e WHERE e.curso_id = c.id) calificacion,
        EXISTS(SELECT 1 FROM inscripciones i WHERE i.curso_id = c.id AND i.alumno_id = ?) inscrito
        FROM cursos c JOIN materias m ON m.id = c.materia_id JOIN usuarios u ON u.id = c.profesor_id WHERE c.id = ?', [$uid, $id]);
    if (!$c) fallar('Curso no encontrado.', 404);
    $soyProfesor = $u && (esAdmin() || (int)$c['profesor_id'] === $uid);
    $inscrito = (bool)$c['inscrito'];
    $c['alumnos'] = (int)$c['alumnos'];
    unset($c['inscrito']);
    // Las funciones esProfesorDe()/estaInscrito() de las secciones usan estos valores ya calculados.
    $GLOBALS['acceso_curso'] = [$id => ['profesor' => $soyProfesor, 'inscrito' => $inscrito]];

    switch ($_GET['seccion'] ?? '') {
        case '':
            $miEvaluacion = $inscrito ? uno('SELECT estrellas_curso, estrellas_profesor, comentario FROM evaluaciones_curso WHERE curso_id = ? AND alumno_id = ?', [$id, $uid]) : null;
            responder(['curso' => $c, 'soy_profesor' => $soyProfesor, 'inscrito' => $inscrito, 'mi_evaluacion' => $miEvaluacion ?: null]);

        case 'actividades':
            exigirAcceso($id);
            $acts = todos('SELECT a.*, (SELECT COUNT(*) FROM entregas e WHERE e.actividad_id = a.id) entregas FROM actividades a WHERE a.curso_id = ? ORDER BY COALESCE(a.fecha_limite, a.creado)', [$id]);
            if ($inscrito && $u) {
                foreach ($acts as &$a) {
                    $a['mi_entrega'] = uno('SELECT e.id, e.archivo_id, e.comentario_alumno, e.calificacion, e.comentario_profesor, e.entregado, ar.titulo archivo, ar.estado archivo_estado
                        FROM entregas e LEFT JOIN archivos ar ON ar.id = e.archivo_id WHERE e.actividad_id = ? AND e.alumno_id = ?', [$a['id'], $u['id']]) ?: null;
                }
            }
            responder(['actividades' => $acts, 'alumnos' => (int)valor('SELECT COUNT(*) FROM inscripciones WHERE curso_id = ?', [$id])]);

        case 'entregas':
            exigirProfesor($id);
            $act = entero($_GET['actividad_id'] ?? null) ?? fallar('Falta la actividad.', 422);
            responder(['entregas' => todos('SELECT u.id alumno_id, u.nombre alumno, e.id, e.archivo_id, e.comentario_alumno, e.calificacion, e.comentario_profesor, e.entregado,
                    ar.titulo archivo, ar.estado archivo_estado, a.fecha_limite, (e.entregado > a.fecha_limite) tarde
                FROM inscripciones i JOIN usuarios u ON u.id = i.alumno_id JOIN actividades a ON a.id = ?
                LEFT JOIN entregas e ON e.actividad_id = a.id AND e.alumno_id = u.id LEFT JOIN archivos ar ON ar.id = e.archivo_id
                WHERE i.curso_id = ? ORDER BY u.nombre', [$act, $id])]);

        case 'alumnos':
            exigirProfesor($id);
            responder(['alumnos' => todos('SELECT u.id, u.nombre, u.email, i.creado inscrito,
                    (SELECT COUNT(*) FROM entregas e JOIN actividades a ON a.id = e.actividad_id WHERE a.curso_id = i.curso_id AND e.alumno_id = u.id) entregas,
                    (SELECT AVG(e.calificacion) FROM entregas e JOIN actividades a ON a.id = e.actividad_id WHERE a.curso_id = i.curso_id AND e.alumno_id = u.id) promedio_actividades,
                    (SELECT AVG(t.puntaje) FROM intentos_examen t JOIN examenes x ON x.id = t.examen_id WHERE x.curso_id = i.curso_id AND t.usuario_id = u.id) promedio_examenes
                FROM inscripciones i JOIN usuarios u ON u.id = i.alumno_id WHERE i.curso_id = ? ORDER BY u.nombre', [$id]),
                'actividades' => (int)valor('SELECT COUNT(*) FROM actividades WHERE curso_id = ?', [$id])]);

        case 'examenes':
            exigirAcceso($id);
            $sql = 'SELECT x.id, x.titulo, x.origen, x.publicado, x.creado, x.preguntas,
                (SELECT COUNT(*) FROM intentos_examen t WHERE t.examen_id = x.id) intentos,
                (SELECT AVG(t.puntaje) FROM intentos_examen t WHERE t.examen_id = x.id) promedio
                FROM examenes x WHERE x.curso_id = ?' . ($soyProfesor ? '' : ' AND x.publicado = 1') . ' ORDER BY x.creado DESC';
            $examenes = todos($sql, [$id]);
            foreach ($examenes as &$x) {
                $preguntas = json_decode($x['preguntas'], true) ?: [];
                $x['num_preguntas'] = count($preguntas);
                if ($soyProfesor) {
                    $x['preguntas'] = $preguntas;
                } else {
                    unset($x['preguntas'], $x['promedio']);
                    $x['mi_intento'] = $u ? uno('SELECT aciertos, total, puntaje, creado FROM intentos_examen WHERE examen_id = ? AND usuario_id = ? ORDER BY id LIMIT 1', [$x['id'], $u['id']]) : null;
                }
            }
            responder(['examenes' => $examenes]);

        case 'examen':
            // El alumno recibe el examen SIN respuestas; se califica en el servidor.
            exigirAcceso($id);
            $x = uno('SELECT id, titulo, preguntas FROM examenes WHERE id = ? AND curso_id = ? AND (publicado = 1 OR ?)', [entero($_GET['examen_id'] ?? null), $id, $soyProfesor ? 1 : 0]);
            if (!$x) fallar('Examen no encontrado.', 404);
            responder(['examen' => ['id' => (int)$x['id'], 'titulo' => $x['titulo'], 'preguntas' => sinRespuestas(json_decode($x['preguntas'], true) ?: [])]]);

        case 'resultados':
            exigirProfesor($id);
            responder(['resultados' => todos('SELECT t.id, t.aciertos, t.total, t.puntaje, t.duracion_seg, t.creado, u.nombre alumno, x.titulo examen
                FROM intentos_examen t JOIN examenes x ON x.id = t.examen_id JOIN usuarios u ON u.id = t.usuario_id
                WHERE x.curso_id = ? ORDER BY t.creado DESC LIMIT 300', [$id])]);

        case 'desempeno':
            if (!$u || !$inscrito) fallar('Inscríbete al curso para ver tu desempeño.', 403);
            responder([
                'actividades' => todos('SELECT a.titulo, a.puntos, a.fecha_limite, e.calificacion, e.entregado, e.comentario_profesor
                    FROM actividades a LEFT JOIN entregas e ON e.actividad_id = a.id AND e.alumno_id = ? WHERE a.curso_id = ? ORDER BY a.creado', [$u['id'], $id]),
                'examenes' => todos('SELECT x.titulo, t.aciertos, t.total, t.puntaje, t.creado FROM examenes x
                    LEFT JOIN intentos_examen t ON t.examen_id = x.id AND t.usuario_id = ? WHERE x.curso_id = ? AND x.publicado = 1 ORDER BY x.creado', [$u['id'], $id]),
                'grupo' => uno('SELECT AVG(t.puntaje) promedio_examenes FROM intentos_examen t JOIN examenes x ON x.id = t.examen_id WHERE x.curso_id = ?', [$id]),
            ]);

        case 'estadisticas':
            exigirProfesor($id);
            $material = todos('SELECT a.id, a.titulo, a.tipo, (SELECT COUNT(*) FROM visitas v WHERE v.ruta = CONCAT("ver.html?id=", a.id)) visitas
                FROM archivos a WHERE a.curso_id = ? AND a.seccion = "curso" ORDER BY visitas DESC LIMIT 15', [$id]);
            $porDia = todos('SELECT DATE(inicio) dia, COUNT(*) visitas FROM visitas WHERE ruta = ? AND inicio > NOW() - INTERVAL 30 DAY GROUP BY DATE(inicio) ORDER BY dia', ['curso.html?id=' . $id]);
            responder([
                'visitas' => uno('SELECT COUNT(*) total, COUNT(DISTINCT usuario_id) personas, COALESCE(AVG(segundos), 0) segundos FROM visitas WHERE ruta = ?', ['curso.html?id=' . $id]),
                'por_dia' => $porDia,
                'material' => $material,
                'entregas' => uno('SELECT COUNT(e.id) total, SUM(e.entregado <= a.fecha_limite OR a.fecha_limite IS NULL) a_tiempo, AVG(e.calificacion) promedio
                    FROM actividades a LEFT JOIN entregas e ON e.actividad_id = a.id WHERE a.curso_id = ?', [$id]),
                'examenes' => todos('SELECT x.titulo, COUNT(t.id) intentos, AVG(t.puntaje) promedio FROM examenes x LEFT JOIN intentos_examen t ON t.examen_id = x.id
                    WHERE x.curso_id = ? GROUP BY x.id ORDER BY x.creado', [$id]),
                'evaluaciones' => todos('SELECT e.estrellas_curso, e.estrellas_profesor, e.comentario, e.creado FROM evaluaciones_curso e WHERE e.curso_id = ? ORDER BY e.creado DESC', [$id]),
            ]);

        default:
            fallar('Sección no válida.', 404);
    }
}

/* ───────────────────────── POST ───────────────────────── */
exigirPost();
$d = entrada();

switch (accion()) {
    case 'postular':
        $u = requiereRol('profesor');
        limitar('postular:' . $u['id'], 10, 86400);
        $materia = entero($d['materia_id'] ?? null) ?? fallar('Falta la materia.', 422);
        if (!valor('SELECT 1 FROM materias WHERE id = ?', [$materia])) fallar('La materia no existe.', 404);
        $previa = valor('SELECT estado FROM postulaciones_profesor WHERE usuario_id = ? AND materia_id = ?', [$u['id'], $materia]);
        if ($previa === 'pendiente' || $previa === 'aprobada') fallar('Ya tienes una postulación ' . $previa . ' para esta materia.', 409);
        ejecutar('INSERT INTO postulaciones_profesor (usuario_id, materia_id, mensaje) VALUES (?, ?, ?)
                  ON DUPLICATE KEY UPDATE mensaje = VALUES(mensaje), estado = "pendiente", creado = NOW(), revisado = NULL, revisado_por = NULL',
            [$u['id'], $materia, texto($d, 'mensaje', 1000, true)]);
        registrar('postulacion_crear', 'materia', $materia);
        responder(['ok' => true], 201);

    case 'crear':
        $u = requiereRol('profesor', 'admin');
        $materia = entero($d['materia_id'] ?? null) ?? fallar('Falta la materia.', 422);
        if (!esAdmin() && !postulacionAprobada($u['id'], $materia)) fallar('Necesitas una postulación aprobada en esta materia para abrir un curso.', 403);
        ejecutar('INSERT INTO cursos (materia_id, profesor_id, titulo, descripcion) VALUES (?, ?, ?, ?)',
            [$materia, $u['id'], texto($d, 'titulo', 160, true), texto($d, 'descripcion', 2000)]);
        $id = (int)db()->lastInsertId();
        registrar('curso_crear', 'curso', $id);
        responder(['ok' => true, 'id' => $id], 201);

    case 'editar':
        $id = entero($d['id'] ?? null) ?? fallar('Falta el curso.', 422);
        exigirProfesor($id);
        ejecutar('UPDATE cursos SET titulo = ?, descripcion = ?, estado = ? WHERE id = ?',
            [texto($d, 'titulo', 160, true), texto($d, 'descripcion', 2000), ($d['estado'] ?? '') === 'archivado' ? 'archivado' : 'activo', $id]);
        registrar('curso_editar', 'curso', $id);
        responder(['ok' => true]);

    case 'inscribir':
        $u = requiereRol('alumno');
        $id = entero($d['curso_id'] ?? null) ?? fallar('Falta el curso.', 422);
        $c = curso($id);
        if ($c['estado'] !== 'activo') fallar('Este curso ya no recibe alumnos.', 409);
        ejecutar('INSERT IGNORE INTO inscripciones (curso_id, alumno_id) VALUES (?, ?)', [$id, $u['id']]);
        registrar('curso_inscribir', 'curso', $id);
        responder(['ok' => true]);

    case 'baja':
        $u = requiereRol('alumno');
        $id = entero($d['curso_id'] ?? null) ?? fallar('Falta el curso.', 422);
        ejecutar('DELETE FROM inscripciones WHERE curso_id = ? AND alumno_id = ?', [$id, $u['id']]);
        registrar('curso_baja', 'curso', $id);
        responder(['ok' => true]);

    case 'quitar_alumno':
        $id = entero($d['curso_id'] ?? null) ?? fallar('Falta el curso.', 422);
        exigirProfesor($id);
        ejecutar('DELETE FROM inscripciones WHERE curso_id = ? AND alumno_id = ?', [$id, entero($d['alumno_id'] ?? null)]);
        registrar('curso_quitar_alumno', 'curso', $id, ['alumno' => $d['alumno_id'] ?? null]);
        responder(['ok' => true]);

    case 'actividad_crear':
        $id = entero($d['curso_id'] ?? null) ?? fallar('Falta el curso.', 422);
        exigirProfesor($id);
        $limite = texto($d, 'fecha_limite', 20);
        if ($limite && !strtotime($limite)) fallar('La fecha límite no es válida.', 422);
        ejecutar('INSERT INTO actividades (curso_id, titulo, descripcion, fecha_limite, puntos) VALUES (?, ?, ?, ?, ?)', [
            $id, texto($d, 'titulo', 160, true), texto($d, 'descripcion', 4000),
            $limite ? date('Y-m-d H:i:s', strtotime($limite)) : null, max(1, min(1000, (int)($d['puntos'] ?? 10))),
        ]);
        $aid = (int)db()->lastInsertId();
        registrar('actividad_crear', 'actividad', $aid);
        responder(['ok' => true, 'id' => $aid], 201);

    case 'actividad_borrar':
        $aid = entero($d['id'] ?? null) ?? fallar('Falta la actividad.', 422);
        $cursoId = (int)valor('SELECT curso_id FROM actividades WHERE id = ?', [$aid]);
        exigirProfesor($cursoId);
        foreach (todos('SELECT * FROM archivos WHERE actividad_id = ?', [$aid]) as $a) borrarArchivo($a);
        ejecutar('DELETE FROM actividades WHERE id = ?', [$aid]);
        registrar('actividad_borrar', 'actividad', $aid);
        responder(['ok' => true]);

    case 'entregar':
        // Entrega solo con texto (el archivo se sube con subir.php, sección «entrega»).
        $u = requiereRol('alumno');
        $aid = entero($d['actividad_id'] ?? null) ?? fallar('Falta la actividad.', 422);
        $cursoId = (int)valor('SELECT curso_id FROM actividades WHERE id = ?', [$aid]);
        if (!$cursoId || !estaInscrito($cursoId)) fallar('Inscríbete al curso para entregar.', 403);
        ejecutar('INSERT INTO entregas (actividad_id, alumno_id, comentario_alumno) VALUES (?, ?, ?)
                  ON DUPLICATE KEY UPDATE comentario_alumno = VALUES(comentario_alumno), entregado = NOW()',
            [$aid, $u['id'], texto($d, 'comentario', 2000, true)]);
        registrar('entrega', 'actividad', $aid);
        responder(['ok' => true]);

    case 'calificar':
        $eid = entero($d['entrega_id'] ?? null) ?? fallar('Falta la entrega.', 422);
        $e = uno('SELECT e.id, a.curso_id, a.puntos FROM entregas e JOIN actividades a ON a.id = e.actividad_id WHERE e.id = ?', [$eid]);
        if (!$e) fallar('Entrega no encontrada.', 404);
        exigirProfesor((int)$e['curso_id']);
        $cal = (float)($d['calificacion'] ?? -1);
        if ($cal < 0 || $cal > (float)$e['puntos']) fallar("La calificación debe estar entre 0 y {$e['puntos']}.", 422);
        ejecutar('UPDATE entregas SET calificacion = ?, comentario_profesor = ?, calificado = NOW() WHERE id = ?', [$cal, texto($d, 'comentario', 2000), $eid]);
        registrar('entrega_calificar', 'entrega', $eid, ['calificacion' => $cal]);
        responder(['ok' => true]);

    case 'examen_guardar':
        $id = entero($d['curso_id'] ?? null) ?? fallar('Falta el curso.', 422);
        exigirProfesor($id);
        $preguntas = [];
        foreach (array_slice((array)($d['preguntas'] ?? []), 0, 60) as $p) {
            $opciones = array_values(array_filter(array_map(fn($o) => mb_substr(trim((string)$o), 0, 500), (array)($p['opciones'] ?? [])), 'strlen'));
            $correcta = (int)($p['correcta'] ?? -1);
            if (trim((string)($p['pregunta'] ?? '')) === '' || count($opciones) < 2 || $correcta < 0 || $correcta >= count($opciones)) continue;
            $preguntas[] = ['pregunta' => mb_substr(trim($p['pregunta']), 0, 2000), 'opciones' => $opciones, 'correcta' => $correcta,
                            'explicacion' => mb_substr(trim((string)($p['explicacion'] ?? '')), 0, 2000), 'tema' => mb_substr(trim((string)($p['tema'] ?? '')), 0, 120)];
        }
        if (!$preguntas) fallar('El examen necesita al menos una pregunta con 2 opciones y la correcta marcada.', 422);
        $c = curso($id);
        ejecutar('INSERT INTO examenes (curso_id, materia_id, autor_id, titulo, origen, modo, preguntas, publicado) VALUES (?, ?, ?, ?, ?, "curso", ?, ?)', [
            $id, $c['materia_id'], usuario()['id'], texto($d, 'titulo', 200, true), ($d['origen'] ?? '') === 'ia' ? 'ia' : 'manual',
            json_encode($preguntas, JSON_UNESCAPED_UNICODE), !empty($d['publicado']) ? 1 : 0,
        ]);
        $xid = (int)db()->lastInsertId();
        registrar('examen_crear', 'examen', $xid, ['preguntas' => count($preguntas)]);
        responder(['ok' => true, 'id' => $xid], 201);

    case 'examen_publicar':
    case 'examen_borrar':
        $xid = entero($d['id'] ?? null) ?? fallar('Falta el examen.', 422);
        $cursoId = (int)valor('SELECT curso_id FROM examenes WHERE id = ?', [$xid]);
        exigirProfesor($cursoId);
        if (accion() === 'examen_borrar') ejecutar('DELETE FROM examenes WHERE id = ?', [$xid]);
        else ejecutar('UPDATE examenes SET publicado = ? WHERE id = ?', [!empty($d['publicado']) ? 1 : 0, $xid]);
        registrar(accion(), 'examen', $xid);
        responder(['ok' => true]);

    case 'examen_responder':
        // Calificación en el servidor: el alumno nunca recibe las respuestas antes de terminar.
        $u = requiereRol('alumno', 'profesor', 'admin');
        $xid = entero($d['examen_id'] ?? null) ?? fallar('Falta el examen.', 422);
        $x = uno('SELECT * FROM examenes WHERE id = ?', [$xid]);
        if (!$x || !$x['curso_id']) fallar('Examen no encontrado.', 404);
        $esProf = esProfesorDe((int)$x['curso_id']);
        if (!$esProf && (!estaInscrito((int)$x['curso_id']) || !$x['publicado'])) fallar('No puedes resolver este examen.', 403);
        if (!$esProf && valor('SELECT 1 FROM intentos_examen WHERE examen_id = ? AND usuario_id = ?', [$xid, $u['id']])) {
            fallar('Ya resolviste este examen; solo cuenta tu primer intento.', 409);
        }
        $preguntas = json_decode($x['preguntas'], true) ?: [];
        $resp = (array)($d['respuestas'] ?? []);
        $aciertos = 0;
        $detalle = [];
        foreach ($preguntas as $i => $p) {
            $r = isset($resp[$i]) && $resp[$i] !== null ? (int)$resp[$i] : null;
            if ($r === $p['correcta']) $aciertos++;
            $detalle[] = ['elegida' => $r, 'correcta' => $p['correcta']];
        }
        $total = count($preguntas);
        if (!$esProf) {
            ejecutar('INSERT INTO intentos_examen (examen_id, usuario_id, modo, materia, titulo, detalle, aciertos, total, puntaje, duracion_seg) VALUES (?, ?, "curso", ?, ?, ?, ?, ?, ?, ?)', [
                $xid, $u['id'], valor('SELECT nombre FROM materias WHERE id = ?', [$x['materia_id']]), $x['titulo'],
                json_encode($detalle), $aciertos, $total, $total ? round($aciertos * 100 / $total, 2) : 0, isset($d['duracion']) ? (int)$d['duracion'] : null,
            ]);
            registrar('examen_intento', 'examen', $xid, ['aciertos' => $aciertos, 'total' => $total]);
        }
        responder(['aciertos' => $aciertos, 'total' => $total,
                   'correctas' => array_column($preguntas, 'correcta'), 'explicaciones' => array_map(fn($p) => $p['explicacion'] ?? '', $preguntas)]);

    case 'evaluar':
        $u = requiereRol('alumno');
        $id = entero($d['curso_id'] ?? null) ?? fallar('Falta el curso.', 422);
        if (!estaInscrito($id)) fallar('Solo los alumnos inscritos pueden evaluar el curso.', 403);
        $ec = (int)($d['estrellas_curso'] ?? 0);
        $ep = (int)($d['estrellas_profesor'] ?? 0);
        if ($ec < 1 || $ec > 5 || $ep < 1 || $ep > 5) fallar('Elige de 1 a 5 estrellas para el curso y para el profesor.', 422);
        if (valor('SELECT 1 FROM evaluaciones_curso WHERE curso_id = ? AND alumno_id = ?', [$id, $u['id']])) fallar('Ya evaluaste este curso.', 409);
        ejecutar('INSERT INTO evaluaciones_curso (curso_id, alumno_id, estrellas_curso, estrellas_profesor, comentario) VALUES (?, ?, ?, ?, ?)',
            [$id, $u['id'], $ec, $ep, texto($d, 'comentario', 2000)]);
        registrar('curso_evaluar', 'curso', $id, ['curso' => $ec, 'profesor' => $ep]);
        responder(['ok' => true], 201);

    default:
        fallar('Acción no válida.', 404);
}
