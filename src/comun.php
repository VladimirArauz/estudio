<?php
// Base de todos los endpoints: JSON, sesión, CSRF, roles y registro de actividad.
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/mensajes.php';

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

session_name($CONFIG['sesion']['nombre']);
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

// Manda la respuesta y corta la conexión, pero el script sigue (PHP-FPM): para que el trabajo posterior
// (p. ej. enviar un correo) no cambie el tiempo de respuesta.
function terminarRespuesta($datos, int $estado = 200): void {
    http_response_code($estado);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE);
    session_write_close();
    if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
    else flush();
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
        // Ningún JSON legítimo de la API pasa de 1 MB (los archivos van como multipart a subir.php).
        if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 1024 * 1024) fallar('La solicitud es demasiado grande.', 413);
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
// para reflejar suspensiones, cambios de rol y de contraseña sin pagar una consulta en cada petición.
// La sesión caduca por inactividad y por duración máxima (más corta para admin).
function usuario(): ?array {
    global $CONFIG;
    static $cache = false;
    if ($cache !== false) return $cache;
    $cache = null;
    if (empty($_SESSION['uid'])) return null;

    $ahora = time();
    $c = $CONFIG['sesion'];
    $guardado = $_SESSION['usuario'] ?? null;
    $maxima = ($guardado['rol'] ?? '') === 'admin' ? $c['maxima_admin'] : $c['maxima'];
    if ($ahora - ($_SESSION['ultimo'] ?? 0) > $c['inactividad'] || $ahora - ($_SESSION['inicio'] ?? 0) > $maxima) {
        cerrarSesion();
        return null;
    }
    $_SESSION['ultimo'] = $ahora;

    if ($guardado && $guardado['id'] === (int)$_SESSION['uid'] && $ahora - ($_SESSION['usuario_t'] ?? 0) < 60) {
        return $cache = $guardado;
    }
    $st = db()->prepare('SELECT id, nombre, email, rol, estado, sesion_version, totp_activo, telefono, email_verificado IS NOT NULL email_verificado,
                                telefono_verificado IS NOT NULL telefono_verificado, requiere_verificar, segundo_factor FROM usuarios WHERE id = ?');
    $st->execute([$_SESSION['uid']]);
    $u = $st->fetch();
    // La versión sube al cambiar o restablecer la contraseña y al suspender: cierra las demás sesiones.
    if (!$u || $u['estado'] !== 'activo' || (int)$u['sesion_version'] !== (int)($_SESSION['version'] ?? 0)) {
        cerrarSesion();
        return null;
    }
    $u['id'] = (int)$u['id'];
    foreach (['totp_activo', 'email_verificado', 'telefono_verificado', 'requiere_verificar'] as $c) $u[$c] = (bool)$u[$c];
    unset($u['sesion_version']);
    if ($guardado && $guardado['rol'] !== $u['rol']) session_regenerate_id(true); // cambio de privilegios
    $_SESSION['usuario'] = $u;
    $_SESSION['usuario_t'] = $ahora;
    return $cache = $u;
}

function cerrarSesion(): void {
    $_SESSION = [];
    session_regenerate_id(true);
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}

// Límite de peticiones con ventana fija: falla con 429 si la clave pasó de $max en $segundos.
function limitar(string $clave, int $max, int $segundos, string $mensaje = 'Demasiadas solicitudes. Espera unos minutos e intenta de nuevo.'): void {
    if (excedeLimite($clave, $max, $segundos)) {
        header('Retry-After: ' . $segundos);
        fallar($mensaje, 429);
    }
}

// Cuenta una petición más y dice si la clave ya pasó de $max (sin cortar la petición).
function excedeLimite(string $clave, int $max, int $segundos): bool {
    $clave = mb_substr($clave, 0, 190);
    ejecutar('INSERT INTO limites (clave, inicio, conteo) VALUES (?, NOW(), 1)
              ON DUPLICATE KEY UPDATE conteo = IF(inicio < NOW() - INTERVAL ? SECOND, 1, conteo + 1),
                                      inicio = IF(inicio < NOW() - INTERVAL ? SECOND, NOW(), inicio)', [$clave, $segundos, $segundos]);
    if (random_int(1, 200) === 1) ejecutar('DELETE FROM limites WHERE inicio < NOW() - INTERVAL 1 DAY');
    return (int)valor('SELECT conteo FROM limites WHERE clave = ?', [$clave]) > $max;
}

// Las cuentas nuevas deben verificar su correo o su teléfono antes de subir, postularse o inscribirse.
// Las que ya existían antes de la verificación tienen requiere_verificar = 0 y no se bloquean.
// Si no hay por dónde mandar códigos (sin SMTP ni SMS configurados), no se exige.
function requiereVerificado(array $u): void {
    if (!correoDisponible() && !smsDisponible()) return;
    if (!empty($u['requiere_verificar']) && empty($u['email_verificado']) && empty($u['telefono_verificado'])) {
        responder(['error' => 'Verifica tu correo o tu teléfono para continuar. Hazlo en «Mi cuenta».', 'code' => 'VERIFICAR'], 403);
    }
}

// Acciones delicadas (roles, contraseñas ajenas, borrados de admin): piden confirmar la contraseña
// (y el código 2FA) en los últimos 5 minutos. El navegador lo resuelve en API.post (código REAUTH).
function exigirReautenticacion(): void {
    if (time() - ($_SESSION['reauth'] ?? 0) > 300) {
        responder(['error' => 'Confirma tu contraseña para continuar.', 'code' => 'REAUTH'], 428);
    }
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
    // Lo exclusivo de admin exige 2FA activo (se activa en «Mi cuenta»).
    if ($roles === ['admin'] && !esAdmin()) {
        responder(['error' => 'Activa la verificación en dos pasos en «Mi cuenta» para usar el panel de administración.', 'code' => 'NECESITA_2FA'], 403);
    }
    return $u;
}

// ¿Admin con 2FA activo? Solo así se aplican los privilegios de admin (ver, borrar o editar lo de otros).
function esAdmin(): bool {
    $u = usuario();
    return $u && $u['rol'] === 'admin' && $u['totp_activo'];
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
    if (esAdmin()) return true;
    if (isset($GLOBALS['acceso_curso'][$cursoId])) return $GLOBALS['acceso_curso'][$cursoId]['profesor'];
    return (bool)valor('SELECT 1 FROM cursos WHERE id = ? AND profesor_id = ?', [$cursoId, $u['id']]);
}

function estaInscrito(int $cursoId): bool {
    $u = usuario();
    if (!$u) return false;
    if (isset($GLOBALS['acceso_curso'][$cursoId])) return $GLOBALS['acceso_curso'][$cursoId]['inscrito'];
    return (bool)valor('SELECT 1 FROM inscripciones WHERE curso_id = ? AND alumno_id = ?', [$cursoId, $u['id']]);
}
