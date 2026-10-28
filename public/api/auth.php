<?php
// Inicio de sesión, registro, cierre de sesión y datos de la sesión actual.
require_once dirname(__DIR__, 2) . '/src/comun.php';

const MAX_INTENTOS = 5;        // fallidos por correo en la ventana
const VENTANA_MIN = 15;

switch (accion()) {
    case 'yo':
        $u = usuario();
        responder([
            'usuario' => $u ? ['id' => $u['id'], 'nombre' => $u['nombre'], 'email' => $u['email']] : null,
            'rol' => rol(),
            'csrf' => $_SESSION['csrf'],
        ]);

    case 'entrar':
        exigirPost();
        $d = entrada();
        $email = strtolower(texto($d, 'email', 190, true));
        $pass = (string)($d['password'] ?? '');

        $fallidos = valor(
            'SELECT COUNT(*) FROM intentos_login WHERE exito = 0 AND fecha > NOW() - INTERVAL ' . VENTANA_MIN . ' MINUTE AND (email = ? OR ip = ?)',
            [$email, ip()]
        );
        if ($fallidos >= MAX_INTENTOS * 2 || valor(
            'SELECT COUNT(*) FROM intentos_login WHERE exito = 0 AND email = ? AND fecha > NOW() - INTERVAL ' . VENTANA_MIN . ' MINUTE', [$email]
        ) >= MAX_INTENTOS) {
            fallar('Demasiados intentos fallidos. Espera ' . VENTANA_MIN . ' minutos e intenta de nuevo.', 429);
        }

        $u = uno('SELECT id, password_hash, estado FROM usuarios WHERE email = ?', [$email]);
        $ok = $u && password_verify($pass, $u['password_hash']);
        ejecutar('INSERT INTO intentos_login (email, ip, exito) VALUES (?, ?, ?)', [$email, ip(), $ok ? 1 : 0]);
        if (!$ok) fallar('El correo o la contraseña no coinciden. Revísalos e intenta de nuevo.', 401);
        if ($u['estado'] !== 'activo') fallar('Tu cuenta está suspendida. Escribe a la administración.', 403);

        if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
            ejecutar('UPDATE usuarios SET password_hash = ? WHERE id = ?', [password_hash($pass, PASSWORD_DEFAULT), $u['id']]);
        }
        iniciarSesion((int)$u['id']);
        registrar('login', 'usuario', (int)$u['id']);
        responder(['ok' => true, 'rol' => rol(), 'csrf' => $_SESSION['csrf']]);

    case 'registrar':
        exigirPost();
        $d = entrada();
        $nombre = texto($d, 'nombre', 120, true);
        $email = strtolower(texto($d, 'email', 190, true));
        $pass = (string)($d['password'] ?? '');
        $rolPedido = ($d['rol'] ?? 'alumno') === 'profesor' ? 'profesor' : 'alumno'; // el admin solo se crea por consola

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fallar('Escribe un correo válido, por ejemplo nombre@gmail.com.', 422);
        if (mb_strlen($pass) < 8) fallar('La contraseña debe tener al menos 8 caracteres.', 422);
        if (valor('SELECT 1 FROM usuarios WHERE email = ?', [$email])) fallar('Ya existe una cuenta con ese correo. Inicia sesión.', 409);
        // Límite simple contra registros masivos.
        if (valor('SELECT COUNT(*) FROM logs WHERE accion = "registro" AND ip = ? AND fecha > NOW() - INTERVAL 1 HOUR', [ip()]) >= 10) {
            fallar('Demasiados registros desde esta conexión. Intenta más tarde.', 429);
        }

        ejecutar('INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)',
            [$nombre, $email, password_hash($pass, PASSWORD_DEFAULT), $rolPedido]);
        $id = (int)db()->lastInsertId();
        iniciarSesion($id);
        registrar('registro', 'usuario', $id, ['rol' => $rolPedido]);
        responder(['ok' => true, 'rol' => $rolPedido, 'csrf' => $_SESSION['csrf']], 201);

    case 'cambiar_password':
        exigirPost();
        $u = requiereRol('admin', 'profesor', 'alumno');
        $d = entrada();
        $nueva = (string)($d['nueva'] ?? '');
        $hash = valor('SELECT password_hash FROM usuarios WHERE id = ?', [$u['id']]);
        if (!password_verify((string)($d['actual'] ?? ''), $hash)) fallar('Tu contraseña actual no coincide.', 403);
        if (mb_strlen($nueva) < 8) fallar('La contraseña nueva debe tener al menos 8 caracteres.', 422);
        ejecutar('UPDATE usuarios SET password_hash = ? WHERE id = ?', [password_hash($nueva, PASSWORD_DEFAULT), $u['id']]);
        session_regenerate_id(true);
        registrar('password_cambiar', 'usuario', $u['id']);
        responder(['ok' => true]);

    case 'salir':
        exigirPost();
        if (usuario()) registrar('logout', 'usuario', usuario()['id']);
        $_SESSION = [];
        session_regenerate_id(true);
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        responder(['ok' => true]);

    default:
        fallar('Acción no válida.', 404);
}

function iniciarSesion(int $id): void {
    session_regenerate_id(true);
    $_SESSION['uid'] = $id;
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
    ejecutar('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ?', [$id]);
}
