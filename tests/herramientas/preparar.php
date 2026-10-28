<?php
// Prepara la BD local de pruebas. Solo corre en consola y con ESTUDIO_ENTORNO=pruebas.
//   ESTUDIO_ENTORNO=pruebas php tests/herramientas/preparar.php reiniciar
//   ESTUDIO_ENTORNO=pruebas php tests/herramientas/preparar.php usuario <rol> <correo> <nombre> <contraseña> [2fa]
//   … limites   (vacía los límites de peticiones)   · sql "SELECT …" (lectura para comprobar)
// Imprime JSON (con el secreto TOTP cuando se pide 2fa).
if (PHP_SAPI !== 'cli') exit(1);
require_once dirname(__DIR__, 2) . '/src/db.php';
require_once dirname(__DIR__, 2) . '/src/contrasenas.php';
require_once dirname(__DIR__, 2) . '/src/totp.php';
if ($ENTORNO !== 'pruebas' || db()->query('SELECT DATABASE()')->fetchColumn() !== 'estudio_pruebas') {
    fwrite(STDERR, "Solo para la BD de pruebas.\n");
    exit(2);
}

[$_, $orden] = array_pad($argv, 2, '');
switch ($orden) {
    case 'reiniciar':
        // Deja solo el catálogo (materias y asesores); vacía todo lo demás y el storage de pruebas.
        $tablas = db()->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
        db()->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach (array_diff($tablas, ['materias', 'asesores']) as $t) db()->exec("TRUNCATE TABLE `$t`");
        db()->exec('SET FOREIGN_KEY_CHECKS = 1');
        foreach (['originales', 'generados'] as $d) {
            $dir = $CONFIG['subidas']['dir'] . "/$d";
            foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $f) {
                if ($f->getFilename() === '.gitkeep') continue;
                $f->isDir() ? rmdir($f->getPathname()) : unlink($f->getPathname());
            }
        }
        echo json_encode(['ok' => true]), "\n";
        break;

    case 'limites':
        // Las pruebas salen todas de 127.0.0.1: se vacían los límites entre una y otra.
        db()->exec('TRUNCATE TABLE limites');
        echo json_encode(['ok' => true]), "\n";
        break;

    case 'sql':
        // Consulta de solo lectura para comprobar el estado de la BD desde las pruebas.
        $sql = $argv[2] ?? '';
        if (!preg_match('/^\s*SELECT\b/i', $sql)) { fwrite(STDERR, "Solo SELECT.\n"); exit(1); }
        echo json_encode(db()->query($sql)->fetchAll()), "\n";
        break;

    case 'usuario':
        [, , $rol, $email, $nombre, $pass] = array_pad($argv, 6, null);
        $conTotp = ($argv[6] ?? '') === '2fa';
        $secreto = $conTotp ? totpNuevoSecreto() : null;
        db()->prepare('INSERT INTO usuarios (nombre, email, password_hash, rol, totp_secreto, totp_activo) VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), password_hash = VALUES(password_hash), rol = VALUES(rol), estado = "activo",
            totp_secreto = VALUES(totp_secreto), totp_activo = VALUES(totp_activo), totp_ultimo = NULL, totp_recuperacion = NULL')
            ->execute([$nombre, strtolower($email), hashContrasena($pass), $rol, $secreto ? cifrar($secreto) : null, $conTotp ? 1 : 0]);
        $id = (int)db()->query('SELECT id FROM usuarios WHERE email = ' . db()->quote(strtolower($email)))->fetchColumn();
        echo json_encode(['id' => $id, 'email' => strtolower($email), 'secreto' => $secreto]), "\n";
        break;

    default:
        fwrite(STDERR, "Uso: reiniciar | limites | sql \"SELECT…\" | usuario <rol> <correo> <nombre> <contraseña> [2fa]\n");
        exit(1);
}
