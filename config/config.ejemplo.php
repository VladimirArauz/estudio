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
    // Códigos de verificación por correo: un buzón de IONOS.
    'mensajes' => [
        'smtp' => ['user' => 'no-responder@tu-dominio.mx', 'pass' => 'contraseña del buzón'],
    ],
];
