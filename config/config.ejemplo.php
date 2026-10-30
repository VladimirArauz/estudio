<?php
// Copia este archivo como config.local.php y completa los valores.
return [
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3307,
        'name' => 'dbsXXXXXXXX',
        'user' => 'dbuXXXXXXX',
        'pass' => 'contraseña',
    ],
    'gemini' => [
        'key' => 'TU_API_KEY',
    ],
    // Códigos de verificación por correo: tu Gmail y una contraseña de aplicación (no la contraseña normal).
    'mensajes' => [
        'smtp' => ['user' => 'tucorreo@gmail.com', 'pass' => 'abcdefghijklmnop'],
    ],
];
