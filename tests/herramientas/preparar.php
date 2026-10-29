<?php
// Prepara la BD local de pruebas. Solo corre en consola y con ESTUDIO_ENTORNO=pruebas.
//   ESTUDIO_ENTORNO=pruebas php tests/herramientas/preparar.php reiniciar
//   ESTUDIO_ENTORNO=pruebas php tests/herramientas/preparar.php usuario <rol> <correo> <nombre> <contraseña> [2fa] [tel=+52…] [nuevo]
//   … limites   (vacía los límites de peticiones)   · sql "SELECT …" (lectura para comprobar)
//   … caducar <usuario_id>   (vence los códigos de verificación vigentes de esa cuenta)
// «nuevo» crea la cuenta como recién registrada (requiere_verificar = 1, sin contacto verificado).
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
        // Vacía todo (también el catálogo, que las pruebas modifican) y vuelve a cargar sql/*.sql como bin/migrar.php,
        // para que cada corrida empiece igual. Vacía también el storage de pruebas.
        $tablas = db()->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
        db()->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach ($tablas as $t) db()->exec("TRUNCATE TABLE `$t`");
        db()->exec('SET FOREIGN_KEY_CHECKS = 1');
        foreach (glob(dirname(__DIR__, 2) . '/sql/*.sql') as $archivo) {
            $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents($archivo));
            foreach (preg_split('/;\s*$/m', $sql) as $sentencia) if (trim($sentencia) !== '') db()->exec($sentencia);
        }
        @unlink($CONFIG['subidas']['dir'] . '/buzon.jsonl');
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
        $opciones = array_slice($argv, 6);
        $conTotp = in_array('2fa', $opciones, true);
        $nuevo = in_array('nuevo', $opciones, true);
        $tel = null;
        foreach ($opciones as $o) if (str_starts_with($o, 'tel=')) $tel = substr($o, 4);
        $secreto = $conTotp ? totpNuevoSecreto() : null;
        db()->prepare('INSERT INTO usuarios (nombre, email, password_hash, rol, totp_secreto, totp_activo, telefono, requiere_verificar) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), password_hash = VALUES(password_hash), rol = VALUES(rol), estado = "activo",
            totp_secreto = VALUES(totp_secreto), totp_activo = VALUES(totp_activo), totp_ultimo = NULL, totp_recuperacion = NULL,
            telefono = VALUES(telefono), requiere_verificar = VALUES(requiere_verificar)')
            ->execute([$nombre, strtolower($email), hashContrasena($pass), $rol, $secreto ? cifrar($secreto) : null, $conTotp ? 1 : 0, $tel, $nuevo ? 1 : 0]);
        $id = (int)db()->query('SELECT id FROM usuarios WHERE email = ' . db()->quote(strtolower($email)))->fetchColumn();
        echo json_encode(['id' => $id, 'email' => strtolower($email), 'secreto' => $secreto]), "\n";
        break;

    case 'caducar':
        $st = db()->prepare('UPDATE codigos_verificacion SET expira = NOW() - INTERVAL 1 SECOND WHERE usuario_id = ? AND usado IS NULL');
        $st->execute([(int)($argv[2] ?? 0)]);
        echo json_encode(['ok' => true, 'caducados' => $st->rowCount()]), "\n";
        break;

    default:
        fwrite(STDERR, "Uso: reiniciar | limites | caducar <id> | sql \"SELECT…\" | usuario <rol> <correo> <nombre> <contraseña> [2fa] [tel=…] [nuevo]\n");
        exit(1);
}
