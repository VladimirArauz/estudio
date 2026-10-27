<?php
// Generador de exámenes con Gemini (portado de ECO_Preparación/server.js).
// A diferencia del original, el prompt se arma aquí: el navegador solo elige modo, materia y tema.
require_once __DIR__ . '/_comun.php';

const MODOS = [
    'simulacro' => ['cantidad' => 12, 'nombre' => 'Simulacro general'],
    'materia'   => ['cantidad' => 8,  'nombre' => 'Examen por materia'],
    'quiz'      => ['cantidad' => 5,  'nombre' => 'Quiz rápido'],
    'ejercicios' => ['cantidad' => 4, 'nombre' => 'Ejercicios por tema'],
    'flashcards' => ['cantidad' => 4, 'nombre' => 'Flashcards'],
];
const TEMARIO = ['Matemáticas', 'Física', 'Química', 'Biología', 'Historia', 'Comunicación', 'Inglés'];

switch (accion()) {
    case 'estado':
        responder(['ia' => $CONFIG['gemini']['key'] !== '', 'modelo' => $CONFIG['gemini']['modelo'], 'modos' => MODOS, 'temario' => TEMARIO]);

    case 'generar':
        exigirPost();
        generar(entrada());

    case 'guardar_intento':
        exigirPost();
        $u = requiereRol('alumno', 'profesor', 'admin');
        $d = entrada();
        $total = max(0, min(200, (int)($d['total'] ?? 0)));
        $aciertos = max(0, min($total, (int)($d['aciertos'] ?? 0)));
        if (!$total) fallar('El intento no tiene preguntas.', 422);
        // Solo práctica personal. Los exámenes de curso se califican en el servidor
        // (cursos.php?accion=examen_responder); aquí nunca se acepta un examen_id.
        if (!empty($d['examen_id'])) fallar('Los exámenes de curso se entregan desde el curso.', 422);
        $detalle = json_encode($d['detalle'] ?? null, JSON_UNESCAPED_UNICODE);
        if (strlen($detalle) > 200000) $detalle = null;
        ejecutar('INSERT INTO intentos_examen (examen_id, usuario_id, modo, materia, titulo, detalle, aciertos, total, puntaje, duracion_seg)
                  VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
            $u['id'], array_key_exists($d['modo'] ?? '', MODOS) ? $d['modo'] : 'materia',
            texto($d, 'materia', 120), texto($d, 'titulo', 200) ?? 'Examen', $detalle, $aciertos, $total,
            round($aciertos * 100 / $total, 2), isset($d['duracion']) ? max(0, (int)$d['duracion']) : null,
        ]);
        $id = (int)db()->lastInsertId();
        registrar('examen_intento', 'intento', $id, ['aciertos' => $aciertos, 'total' => $total]);
        responder(['ok' => true, 'id' => $id], 201);

    case 'desempeno':
        $u = requiereRol('alumno', 'profesor', 'admin');
        $resumen = uno('SELECT COUNT(*) intentos, COALESCE(AVG(puntaje), 0) promedio, COALESCE(MAX(puntaje), 0) mejor, COALESCE(SUM(total), 0) preguntas
                        FROM intentos_examen WHERE usuario_id = ?', [$u['id']]);
        $porMateria = todos('SELECT COALESCE(materia, "General") materia, COUNT(*) intentos, AVG(puntaje) promedio
                             FROM intentos_examen WHERE usuario_id = ? GROUP BY COALESCE(materia, "General") ORDER BY promedio', [$u['id']]);
        $ultimos = todos('SELECT id, modo, materia, titulo, aciertos, total, puntaje, duracion_seg, creado
                          FROM intentos_examen WHERE usuario_id = ? ORDER BY creado DESC LIMIT 20', [$u['id']]);
        responder(['resumen' => $resumen, 'por_materia' => $porMateria, 'ultimos' => $ultimos]);

    default:
        fallar('Acción no válida.', 404);
}

function generar(array $d): never {
    global $CONFIG;
    $modo = $d['modo'] ?? '';
    if (!isset(MODOS[$modo])) fallar('Modo no válido.', 422);
    $materia = texto($d, 'materia', 80);
    if ($modo !== 'simulacro' && !$materia) fallar('Elige una materia.', 422);
    $tema = texto($d, 'tema', 120);
    $cantidad = max(1, min(20, (int)($d['cantidad'] ?? MODOS[$modo]['cantidad'])));
    $variante = max(1, min(20, (int)($d['variante'] ?? 1)));
    $nivel = in_array($d['nivel'] ?? '', ['basico', 'intermedio', 'avanzado'], true) ? $d['nivel'] : 'intermedio';

    $c = $CONFIG['gemini'];
    if ($c['key'] === '') responder(['ok' => false, 'code' => 'NO_API_KEY', 'error' => 'La IA no está configurada en el servidor; se usa el banco local de preguntas.']);

    $prompt = construirPrompt($modo, $materia, $tema, $cantidad, $nivel, $variante);
    $clave = hash('sha256', $c['modelo'] . '|' . $prompt);

    db()->exec('DELETE FROM cache_ia WHERE expira < NOW()');
    if ($guardado = valor('SELECT respuesta FROM cache_ia WHERE clave = ?', [$clave])) {
        responder(['ok' => true, 'cached' => true, 'datos' => json_decode($guardado, true)]);
    }

    // Límite diario por usuario (o por IP para invitados), solo para llamadas reales.
    $quien = usuario() ? 'u' . usuario()['id'] : 'ip' . ip();
    $usado = (int)valor('SELECT conteo FROM uso_ia WHERE quien = ? AND fecha = CURDATE()', [$quien]);
    $limite = usuario() ? $c['limite_diario'] : (int)ceil($c['limite_diario'] / 4);
    if ($usado >= $limite) responder(['ok' => false, 'code' => 'LIMITE', 'error' => "Llegaste al límite de {$limite} exámenes generados hoy. Mañana se renueva; mientras, usa el banco local."]);

    $texto = llamarGemini($prompt, $c['key'], $c['modelo']);
    $datos = json_decode(limpiarJson($texto), true);
    if (!is_array($datos)) responder(['ok' => false, 'code' => 'RESPUESTA_INVALIDA', 'error' => 'La IA devolvió un formato inesperado. Intenta de nuevo.']);
    $datos = normalizar($modo, $datos);
    if (!$datos) responder(['ok' => false, 'code' => 'RESPUESTA_INVALIDA', 'error' => 'La IA no generó preguntas válidas. Intenta de nuevo.']);

    ejecutar('INSERT INTO uso_ia (quien, fecha, conteo) VALUES (?, CURDATE(), 1) ON DUPLICATE KEY UPDATE conteo = conteo + 1', [$quien]);
    ejecutar('REPLACE INTO cache_ia (clave, respuesta, expira) VALUES (?, ?, NOW() + INTERVAL ? SECOND)',
        [$clave, json_encode($datos, JSON_UNESCAPED_UNICODE), $c['cache_ttl']]);
    registrar('ia_generar', null, null, ['modo' => $modo, 'materia' => $materia, 'tema' => $tema]);
    responder(['ok' => true, 'cached' => false, 'datos' => $datos]);
}

function construirPrompt(string $modo, ?string $materia, ?string $tema, int $n, string $nivel, int $variante): string {
    $sobre = $modo === 'simulacro'
        ? 'todas las materias del examen de admisión al nivel superior del IPN (' . implode(', ', TEMARIO) . '), repartidas de forma equilibrada'
        : "la materia {$materia}" . ($tema ? ", tema «{$tema}»" : '');
    $base = "Eres un profesor experto que prepara a estudiantes de bachillerato del CECyT 9 del IPN para su examen de admisión al nivel superior.\n"
        . "Escribe en español de México, claro y directo. Nivel de dificultad: {$nivel}. Variante {$variante}: no repitas preguntas típicas de otras variantes.\n"
        . "Las fórmulas van en texto plano (por ejemplo x^2, sqrt(2), H2O). No uses Markdown ni HTML.\n";
    switch ($modo) {
        case 'flashcards':
            return $base . "Genera {$n} flashcards de repaso sobre {$sobre}.\n"
                . 'Responde SOLO con JSON: {"tarjetas":[{"frente":"concepto o pregunta corta","reverso":"respuesta concisa de 1 a 3 oraciones","tema":"subtema"}]}';
        case 'ejercicios':
            return $base . "Genera {$n} ejercicios de práctica resueltos paso a paso sobre {$sobre}.\n"
                . 'Responde SOLO con JSON: {"ejercicios":[{"enunciado":"...","pasos":["paso 1","paso 2"],"respuesta":"resultado final","tema":"subtema"}]}';
        default:
            return $base . "Genera {$n} preguntas de opción múltiple sobre {$sobre}, al estilo del examen de admisión del IPN.\n"
                . "Cada pregunta tiene exactamente 4 opciones y una sola correcta; reparte la posición de la correcta.\n"
                . 'Responde SOLO con JSON: {"preguntas":[{"pregunta":"...","opciones":["A","B","C","D"],"correcta":0,"explicacion":"por qué es correcta en 1 a 3 oraciones","materia":"...","tema":"..."}]}'
                . "\nEl campo correcta es el índice (0 a 3) de la opción correcta.";
    }
}

function llamarGemini(string $prompt, string $key, string $modelo): string {
    $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($modelo) . ':generateContent';
    $cuerpo = json_encode([
        'contents' => [['parts' => [['text' => $prompt]]]],
        'generationConfig' => ['temperature' => 0.55, 'maxOutputTokens' => 6144, 'responseMimeType' => 'application/json'],
    ]);
    $ctx = stream_context_create(['http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/json\r\nx-goog-api-key: {$key}\r\n",
        'content' => $cuerpo,
        'timeout' => 90,
        'ignore_errors' => true,
    ]]);
    $respuesta = @file_get_contents($url, false, $ctx);
    if ($respuesta === false) responder(['ok' => false, 'code' => 'RED', 'error' => 'No se pudo conectar con Gemini. Revisa tu conexión a internet.']);
    $estado = 0;
    foreach ($http_response_header ?? [] as $h) if (preg_match('#^HTTP/\S+\s+(\d{3})#', $h, $m)) $estado = (int)$m[1];
    $datos = json_decode($respuesta, true) ?: [];
    if ($estado !== 200) {
        $mensaje = $datos['error']['message'] ?? '';
        if ($estado === 429 || preg_match('/quota|RESOURCE_EXHAUSTED/i', $mensaje)) {
            responder(['ok' => false, 'code' => 'QUOTA_EXHAUSTED', 'error' => 'Se agotó la cuota de Gemini por ahora. Intenta más tarde; mientras, usa el banco local.']);
        }
        if ($estado === 400 && stripos($mensaje, 'API key') !== false) {
            responder(['ok' => false, 'code' => 'INVALID_API_KEY', 'error' => 'La API key de Gemini no es válida. La administración debe actualizarla.']);
        }
        error_log("[estudio] Gemini {$estado}: {$mensaje}");
        responder(['ok' => false, 'code' => 'GEMINI_ERROR', 'error' => 'Gemini no pudo generar contenido en este momento. Inténtalo de nuevo.']);
    }
    $texto = $datos['candidates'][0]['content']['parts'][0]['text'] ?? '';
    if ($texto === '') {
        $razon = $datos['candidates'][0]['finishReason'] ?? '';
        responder(['ok' => false, 'code' => 'EMPTY_RESPONSE', 'error' => $razon === 'MAX_TOKENS'
            ? 'Gemini alcanzó su límite de texto. Pide menos preguntas.' : 'Gemini devolvió una respuesta vacía. Intenta de nuevo.']);
    }
    return $texto;
}

function limpiarJson(string $t): string {
    $t = trim($t);
    $t = preg_replace('/^```(?:json)?\s*|\s*```$/', '', $t);
    return $t;
}

// Valida y recorta lo que devolvió la IA: nunca se confía en su forma.
function normalizar(string $modo, array $d): array {
    $s = fn($v, $max = 2000) => mb_substr(trim((string)$v), 0, $max);
    if ($modo === 'flashcards') {
        $t = array_values(array_filter(array_map(fn($x) => is_array($x) && !empty($x['frente']) && !empty($x['reverso'])
            ? ['frente' => $s($x['frente'], 500), 'reverso' => $s($x['reverso']), 'tema' => $s($x['tema'] ?? '', 120)] : null, $d['tarjetas'] ?? [])));
        return $t ? ['tarjetas' => $t] : [];
    }
    if ($modo === 'ejercicios') {
        $e = array_values(array_filter(array_map(fn($x) => is_array($x) && !empty($x['enunciado'])
            ? ['enunciado' => $s($x['enunciado']), 'pasos' => array_map(fn($p) => $s($p, 1000), array_slice((array)($x['pasos'] ?? []), 0, 12)),
               'respuesta' => $s($x['respuesta'] ?? '', 500), 'tema' => $s($x['tema'] ?? '', 120)] : null, $d['ejercicios'] ?? [])));
        return $e ? ['ejercicios' => $e] : [];
    }
    $p = array_values(array_filter(array_map(function ($x) use ($s) {
        if (!is_array($x) || empty($x['pregunta']) || !is_array($x['opciones'] ?? null) || count($x['opciones']) < 2) return null;
        $opciones = array_map(fn($o) => $s($o, 500), array_slice(array_values($x['opciones']), 0, 6));
        $correcta = (int)($x['correcta'] ?? -1);
        if ($correcta < 0 || $correcta >= count($opciones)) return null;
        return ['pregunta' => $s($x['pregunta']), 'opciones' => $opciones, 'correcta' => $correcta,
                'explicacion' => $s($x['explicacion'] ?? ''), 'materia' => $s($x['materia'] ?? '', 80), 'tema' => $s($x['tema'] ?? '', 120)];
    }, $d['preguntas'] ?? [])));
    return $p ? ['preguntas' => $p] : [];
}
