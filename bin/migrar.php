<?php
// Ejecuta los archivos de sql/ en orden. Uso: /opt/lampp/bin/php bin/migrar.php
if (PHP_SAPI !== 'cli') exit;
require_once dirname(__DIR__) . '/api/_db.php';

foreach (glob(dirname(__DIR__) . '/sql/*.sql') as $archivo) {
    $sql = file_get_contents($archivo);
    // Quita comentarios de línea y separa por ';' al final de línea.
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    foreach (preg_split('/;\s*$/m', $sql) as $sentencia) {
        if (trim($sentencia) !== '') db()->exec($sentencia);
    }
    echo 'OK  ', basename($archivo), PHP_EOL;
}
