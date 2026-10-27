<?php
// Base de todos los endpoints: JSON, sesión, CSRF, roles y registro de actividad.
require_once __DIR__ . '/_db.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

set_exception_handler(function (Throwable $e) {
    error_log('[estudio] ' . $e->getMessage() . ' en ' . $e->getFile() . ':' . $e->getLine());
    if (!headers_sent()) http_response_code(500);
    $mensaje = $e instanceof PDOException && str_contains($e->getMessage(), 'SQLSTATE[HY000] [2002]')
        ? 'No hay conexión con la base de datos. ¿Está abierto el túnel (bin/tunel.sh)?'
        : 'Ocurrió un error en el servidor. Intenta de nuevo.';
    echo json_encode(['error' => $mensaje]);
});

session_name('BATIZ');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'httponly' => true,
    'samesite' => 'Lax',
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
]);
session_start();
if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));

function responder($datos, int $estado = 200): never {
    http_response_code($estado);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE);
    exit;
}

function fallar(string $mensaje, int $estado = 400): never {
    responder(['error' => $mensaje], $estado);
}

function metodo(): string { return $_SERVER['REQUEST_METHOD']; }
function accion(): string { return (string)($_GET['accion'] ?? ''); }

// Cuerpo JSON (o formulario) de la petición.
function entrada(): array {
    static $datos = null;
    if ($datos !== null) return $datos;
    $tipo = $_SERVER['CONTENT_TYPE'] ?? '';
    if (str_starts_with($tipo, 'application/json')) {
        $datos = json_decode(file_get_contents('php://input'), true) ?: [];
    } else {
        $datos = $_POST;
    }
    return $datos;
}

function texto(array $datos, string $campo, int $max = 255, bool $requerido = false): ?string {
    $valor = isset($datos[$campo]) ? trim((string)$datos[$campo]) : '';
    if ($valor === '') {
        if ($requerido) fallar("Falta el campo «{$campo}».", 422);
        return null;
    }
    return mb_substr($valor, 0, $max);
}

function entero($valor): ?int {
    return filter_var($valor, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) ?: null;
}

function ip(): string { return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'; }

// Toda petición que modifica datos debe traer el token de la sesión.
function exigirPost(): void {
    if (metodo() !== 'POST') fallar('Método no permitido.', 405);
    $token = $_SERVER['HTTP_X_CSRF'] ?? ($_POST['csrf'] ?? '');
    if (!hash_equals($_SESSION['csrf'], (string)$token)) fallar('La sesión expiró. Recarga la página e intenta de nuevo.', 419);
}

// Usuario de la sesión, o null si es invitado. Se relee de la BD cada 60 s (la BD está lejos)
// para reflejar suspensiones y cambios de rol sin pagar una consulta en cada petición.
function usuario(): ?array {
    static $cache = false;
    if ($cache !== false) return $cache;
    $cache = null;
    if (empty($_SESSION['uid'])) return null;
    $guardado = $_SESSION['usuario'] ?? null;
    if ($guardado && $guardado['id'] === (int)$_SESSION['uid'] && time() - ($_SESSION['usuario_t'] ?? 0) < 60) {
        return $cache = $guardado;
    }
    $st = db()->prepare('SELECT id, nombre, email, rol, estado FROM usuarios WHERE id = ?');
    $st->execute([$_SESSION['uid']]);
    $u = $st->fetch();
    if ($u && $u['estado'] === 'activo') {
        $u['id'] = (int)$u['id'];
        $_SESSION['usuario'] = $u;
        $_SESSION['usuario_t'] = time();
        $cache = $u;
    } else {
        unset($_SESSION['uid'], $_SESSION['usuario']);
    }
    return $cache;
}

// Tras cambiar rol o estado de alguien, su sesión debe releerlo.
function olvidarUsuarioEnSesion(): void {
    unset($_SESSION['usuario'], $_SESSION['usuario_t']);
}

function rol(): string { return usuario()['rol'] ?? 'invitado'; }

function requiereRol(string ...$roles): array {
    $u = usuario();
    if (!$u) fallar('Inicia sesión para hacer esto.', 401);
    if (!in_array($u['rol'], $roles, true)) fallar('Tu cuenta no tiene permiso para hacer esto.', 403);
    return $u;
}

function registrar(string $accion, ?string $tipo = null, ?int $id = null, $detalle = null): void {
    $st = db()->prepare('INSERT INTO logs (usuario_id, accion, objeto_tipo, objeto_id, detalle, ip) VALUES (?, ?, ?, ?, ?, ?)');
    $st->execute([
        usuario()['id'] ?? null, $accion, $tipo, $id,
        $detalle === null ? null : (is_string($detalle) ? $detalle : json_encode($detalle, JSON_UNESCAPED_UNICODE)),
        ip(),
    ]);
}

function uno(string $sql, array $params = []) {
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st->fetch();
}

function todos(string $sql, array $params = []): array {
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st->fetchAll();
}

function valor(string $sql, array $params = []) {
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st->fetchColumn();
}

function ejecutar(string $sql, array $params = []): int {
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st->rowCount();
}

// ¿Este usuario es el profesor del curso (o admin)?
// Si el endpoint ya calculó el acceso al curso, se reutiliza (ver api/cursos.php).
function esProfesorDe(int $cursoId): bool {
    $u = usuario();
    if (!$u) return false;
    if ($u['rol'] === 'admin') return true;
    if (isset($GLOBALS['acceso_curso'][$cursoId])) return $GLOBALS['acceso_curso'][$cursoId]['profesor'];
    return (bool)valor('SELECT 1 FROM cursos WHERE id = ? AND profesor_id = ?', [$cursoId, $u['id']]);
}

function estaInscrito(int $cursoId): bool {
    $u = usuario();
    if (!$u) return false;
    if (isset($GLOBALS['acceso_curso'][$cursoId])) return $GLOBALS['acceso_curso'][$cursoId]['inscrito'];
    return (bool)valor('SELECT 1 FROM inscripciones WHERE curso_id = ? AND alumno_id = ?', [$cursoId, $u['id']]);
}
