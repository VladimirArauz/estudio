<?php
// Crea (o restablece) un administrador.
// Uso: /opt/lampp/bin/php bin/crear-admin.php correo@ejemplo.com "Nombre" [contraseña]
// Sin contraseña genera una aleatoria y la muestra una sola vez.
if (PHP_SAPI !== 'cli') exit;
require_once dirname(__DIR__) . '/api/_db.php';

[$_, $email, $nombre] = array_pad($argv, 3, null);
$pass = $argv[3] ?? rtrim(strtr(base64_encode(random_bytes(12)), '+/', 'Kx'), '=');
if (!$email || !$nombre) exit("Uso: php bin/crear-admin.php correo \"Nombre\" [contraseña]\n");

db()->prepare(
    'INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, "admin")
     ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), password_hash = VALUES(password_hash), rol = "admin", estado = "activo"'
)->execute([$nombre, strtolower($email), password_hash($pass, PASSWORD_DEFAULT)]);

echo "Admin listo: $email\nContraseña: $pass\n";
