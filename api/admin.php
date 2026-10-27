<?php
// Panel de administración: todo lo que pasa en la plataforma, resumido por secciones.
require_once __DIR__ . '/_comun.php';

$yo = requiereRol('admin');
const POR_PAGINA = 50;

function pagina(): int { return max(1, (int)($_GET['pagina'] ?? 1)); }
function paginar(string $sqlConteo, string $sql, array $params): array {
    $total = (int)valor($sqlConteo, $params);
    $offset = (pagina() - 1) * POR_PAGINA;
    return ['filas' => todos($sql . ' LIMIT ' . POR_PAGINA . ' OFFSET ' . $offset, $params), 'total' => $total,
            'pagina' => pagina(), 'paginas' => max(1, (int)ceil($total / POR_PAGINA))];
}

if (metodo() === 'GET') {
    switch ($_GET['seccion'] ?? 'resumen') {
        case 'resumen':
            // Una consulta con todos los conteos (cada viaje a la BD remota cuesta ~150 ms).
            $k = uno('SELECT
                (SELECT COUNT(*) FROM usuarios WHERE rol = "admin") admins,
                (SELECT COUNT(*) FROM usuarios WHERE rol = "profesor") profesores,
                (SELECT COUNT(*) FROM usuarios WHERE rol = "alumno") alumnos,
                (SELECT COUNT(*) FROM usuarios WHERE creado > NOW() - INTERVAL 7 DAY) usuarios_nuevos,
                (SELECT COUNT(*) FROM archivos) archivos,
                (SELECT COUNT(*) FROM archivos WHERE estado = "error") archivos_error,
                (SELECT COUNT(*) FROM archivos WHERE estado IN ("pendiente","procesando")) archivos_cola,
                (SELECT COALESCE(SUM(bytes), 0) FROM archivos) bytes,
                (SELECT COUNT(*) FROM cursos WHERE estado = "activo") cursos,
                (SELECT COUNT(*) FROM postulaciones_profesor WHERE estado = "pendiente") postulaciones,
                (SELECT COUNT(*) FROM intentos_examen) intentos,
                (SELECT COALESCE(AVG(puntaje), 0) FROM intentos_examen) promedio_examenes,
                (SELECT COUNT(*) FROM visitas WHERE inicio > CURDATE()) visitas_hoy,
                (SELECT COUNT(*) FROM visitas WHERE inicio > NOW() - INTERVAL 7 DAY) visitas_7d,
                (SELECT COALESCE(AVG(segundos), 0) FROM visitas WHERE inicio > NOW() - INTERVAL 30 DAY) segundos_promedio');
            $subidas = todos('SELECT DATE(creado) dia, COUNT(*) n FROM archivos WHERE creado > NOW() - INTERVAL 14 DAY GROUP BY DATE(creado) ORDER BY dia');
            $porTipo = todos('SELECT tipo, COUNT(*) n FROM archivos GROUP BY tipo ORDER BY n DESC');
            $recientes = todos('SELECT l.accion, l.objeto_tipo, l.objeto_id, l.fecha, u.nombre FROM logs l LEFT JOIN usuarios u ON u.id = l.usuario_id ORDER BY l.id DESC LIMIT 12');
            responder(['kpis' => $k, 'subidas' => $subidas, 'por_tipo' => $porTipo, 'recientes' => $recientes]);

        case 'usuarios':
            $where = ['1'];
            $p = [];
            if ($q = texto($_GET, 'q', 100)) { $where[] = '(u.nombre LIKE ? OR u.email LIKE ?)'; $p[] = "%$q%"; $p[] = "%$q%"; }
            if (in_array($_GET['rol'] ?? '', ['admin', 'profesor', 'alumno'], true)) { $where[] = 'u.rol = ?'; $p[] = $_GET['rol']; }
            $w = implode(' AND ', $where);
            responder(paginar("SELECT COUNT(*) FROM usuarios u WHERE $w",
                "SELECT u.id, u.nombre, u.email, u.rol, u.estado, u.creado, u.ultimo_acceso,
                    (SELECT COUNT(*) FROM archivos a WHERE a.autor_id = u.id) archivos,
                    (SELECT COALESCE(SUM(v.segundos), 0) FROM visitas v WHERE v.usuario_id = u.id) segundos
                 FROM usuarios u WHERE $w ORDER BY u.creado DESC", $p));

        case 'contenido':
            $where = ['1'];
            $p = [];
            foreach (['seccion', 'estado', 'tipo'] as $campo) {
                if (!empty($_GET[$campo]) && preg_match('/^[a-z]+$/', $_GET[$campo])) { $where[] = "a.$campo = ?"; $p[] = $_GET[$campo]; }
            }
            if ($q = texto($_GET, 'q', 100)) { $where[] = '(a.titulo LIKE ? OR a.nombre_original LIKE ?)'; $p[] = "%$q%"; $p[] = "%$q%"; }
            $w = implode(' AND ', $where);
            responder(paginar("SELECT COUNT(*) FROM archivos a WHERE $w",
                "SELECT a.id, a.titulo, a.nombre_original, a.seccion, a.tipo, a.bytes, a.estado, a.error, a.creado,
                    u.nombre autor, m.nombre materia, (SELECT COUNT(*) FROM visitas v WHERE v.ruta = CONCAT('ver.html?id=', a.id)) visitas
                 FROM archivos a LEFT JOIN usuarios u ON u.id = a.autor_id LEFT JOIN materias m ON m.id = a.materia_id
                 WHERE $w ORDER BY a.id DESC", $p));

        case 'postulaciones':
            responder(['filas' => todos('SELECT p.id, p.mensaje, p.estado, p.creado, p.revisado, u.nombre, u.email, m.nombre materia, r.nombre revisor
                FROM postulaciones_profesor p JOIN usuarios u ON u.id = p.usuario_id JOIN materias m ON m.id = p.materia_id
                LEFT JOIN usuarios r ON r.id = p.revisado_por ORDER BY p.estado = "pendiente" DESC, p.creado DESC LIMIT 300')]);

        case 'cursos':
            responder([
                'cursos' => todos('SELECT c.id, c.titulo, c.estado, c.creado, m.nombre materia, u.nombre profesor,
                    (SELECT COUNT(*) FROM inscripciones i WHERE i.curso_id = c.id) alumnos,
                    (SELECT COUNT(*) FROM visitas v WHERE v.ruta = CONCAT("curso.html?id=", c.id)) visitas,
                    (SELECT AVG(e.estrellas_curso) FROM evaluaciones_curso e WHERE e.curso_id = c.id) estrellas_curso,
                    (SELECT AVG(e.estrellas_profesor) FROM evaluaciones_curso e WHERE e.curso_id = c.id) estrellas_profesor,
                    (SELECT COUNT(*) FROM evaluaciones_curso e WHERE e.curso_id = c.id) evaluaciones
                    FROM cursos c JOIN materias m ON m.id = c.materia_id JOIN usuarios u ON u.id = c.profesor_id ORDER BY c.creado DESC'),
                'evaluaciones' => todos('SELECT e.estrellas_curso, e.estrellas_profesor, e.comentario, e.creado, c.titulo curso, u.nombre alumno
                    FROM evaluaciones_curso e JOIN cursos c ON c.id = e.curso_id JOIN usuarios u ON u.id = e.alumno_id ORDER BY e.creado DESC LIMIT 100'),
            ]);

        case 'examenes':
            responder([
                'por_modo' => todos('SELECT modo, COUNT(*) intentos, AVG(puntaje) promedio FROM intentos_examen GROUP BY modo ORDER BY intentos DESC'),
                'por_materia' => todos('SELECT COALESCE(materia, "General") materia, COUNT(*) intentos, AVG(puntaje) promedio FROM intentos_examen GROUP BY COALESCE(materia, "General") ORDER BY promedio'),
                'recientes' => todos('SELECT t.titulo, t.modo, t.aciertos, t.total, t.puntaje, t.duracion_seg, t.creado, u.nombre FROM intentos_examen t
                    JOIN usuarios u ON u.id = t.usuario_id ORDER BY t.id DESC LIMIT 100'),
                'ia' => uno('SELECT (SELECT COALESCE(SUM(conteo), 0) FROM uso_ia WHERE fecha = CURDATE()) hoy,
                    (SELECT COALESCE(SUM(conteo), 0) FROM uso_ia WHERE fecha > CURDATE() - INTERVAL 30 DAY) mes,
                    (SELECT COUNT(*) FROM cache_ia) en_cache'),
            ]);

        case 'analitica':
            $dias = max(1, min(365, (int)($_GET['dias'] ?? 30)));
            responder([
                'rutas' => todos("SELECT ruta, COUNT(*) visitas, COUNT(DISTINCT usuario_id) personas, AVG(segundos) segundos
                    FROM visitas WHERE inicio > NOW() - INTERVAL $dias DAY GROUP BY ruta ORDER BY visitas DESC LIMIT 25"),
                'secciones' => todos("SELECT COALESCE(seccion, 'otra') seccion, COUNT(*) visitas, AVG(segundos) segundos, SUM(segundos) total
                    FROM visitas WHERE inicio > NOW() - INTERVAL $dias DAY GROUP BY COALESCE(seccion, 'otra') ORDER BY visitas DESC"),
                'por_dia' => todos("SELECT DATE(inicio) dia, COUNT(*) visitas, COUNT(DISTINCT usuario_id) personas FROM visitas
                    WHERE inicio > NOW() - INTERVAL $dias DAY GROUP BY DATE(inicio) ORDER BY dia"),
                'usuarios' => todos("SELECT u.nombre, u.rol, SUM(v.segundos) segundos, COUNT(*) visitas FROM visitas v JOIN usuarios u ON u.id = v.usuario_id
                    WHERE v.inicio > NOW() - INTERVAL $dias DAY GROUP BY u.id ORDER BY segundos DESC LIMIT 15"),
                'dias' => $dias,
            ]);

        case 'logs':
            $where = ['1'];
            $p = [];
            if ($a = texto($_GET, 'accion', 60)) { $where[] = 'l.accion LIKE ?'; $p[] = "%$a%"; }
            if ($q = texto($_GET, 'q', 100)) { $where[] = '(u.nombre LIKE ? OR u.email LIKE ? OR l.ip LIKE ?)'; array_push($p, "%$q%", "%$q%", "%$q%"); }
            $w = implode(' AND ', $where);
            responder(paginar("SELECT COUNT(*) FROM logs l LEFT JOIN usuarios u ON u.id = l.usuario_id WHERE $w",
                "SELECT l.id, l.accion, l.objeto_tipo, l.objeto_id, l.detalle, l.ip, l.fecha, u.nombre, u.rol
                 FROM logs l LEFT JOIN usuarios u ON u.id = l.usuario_id WHERE $w ORDER BY l.id DESC", $p));

        default:
            fallar('Sección no válida.', 404);
    }
}

exigirPost();
$d = entrada();
$id = entero($d['id'] ?? null) ?? fallar('Falta el identificador.', 422);

switch (accion()) {
    case 'usuario_rol':
        $rol = $d['rol'] ?? '';
        if (!in_array($rol, ['admin', 'profesor', 'alumno'], true)) fallar('Rol no válido.', 422);
        if ($id === $yo['id'] && $rol !== 'admin') fallar('No puedes quitarte el rol de admin a ti mismo.', 409);
        ejecutar('UPDATE usuarios SET rol = ? WHERE id = ?', [$rol, $id]);
        registrar('admin_usuario_rol', 'usuario', $id, ['rol' => $rol]);
        responder(['ok' => true]);

    case 'usuario_estado':
        $estado = ($d['estado'] ?? '') === 'suspendido' ? 'suspendido' : 'activo';
        if ($id === $yo['id']) fallar('No puedes suspender tu propia cuenta.', 409);
        ejecutar('UPDATE usuarios SET estado = ? WHERE id = ?', [$estado, $id]);
        registrar('admin_usuario_estado', 'usuario', $id, ['estado' => $estado]);
        responder(['ok' => true]);

    case 'usuario_password':
        // Contraseña temporal: se muestra una sola vez al admin para que se la entregue a la persona.
        $temporal = rtrim(strtr(base64_encode(random_bytes(9)), '+/', 'Kx'), '=');
        ejecutar('UPDATE usuarios SET password_hash = ? WHERE id = ?', [password_hash($temporal, PASSWORD_DEFAULT), $id]);
        registrar('admin_usuario_password', 'usuario', $id);
        responder(['ok' => true, 'temporal' => $temporal]);

    case 'postulacion':
        $estado = $d['estado'] ?? '';
        if (!in_array($estado, ['aprobada', 'rechazada'], true)) fallar('Estado no válido.', 422);
        $post = uno('SELECT usuario_id FROM postulaciones_profesor WHERE id = ?', [$id]) ?: fallar('Postulación no encontrada.', 404);
        ejecutar('UPDATE postulaciones_profesor SET estado = ?, revisado_por = ?, revisado = NOW() WHERE id = ?', [$estado, $yo['id'], $id]);
        // Al aprobar, la persona pasa a ser profesor si todavía era alumno.
        if ($estado === 'aprobada') ejecutar('UPDATE usuarios SET rol = "profesor" WHERE id = ? AND rol = "alumno"', [$post['usuario_id']]);
        registrar('admin_postulacion', 'postulacion', $id, ['estado' => $estado]);
        responder(['ok' => true]);

    case 'curso_estado':
        $estado = ($d['estado'] ?? '') === 'archivado' ? 'archivado' : 'activo';
        ejecutar('UPDATE cursos SET estado = ? WHERE id = ?', [$estado, $id]);
        registrar('admin_curso_estado', 'curso', $id, ['estado' => $estado]);
        responder(['ok' => true]);

    default:
        fallar('Acción no válida.', 404);
}
