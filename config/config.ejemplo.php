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
    // Códigos de verificación. Correo: un buzón de IONOS. SMS (opcional, cuesta por mensaje): Twilio.
    'mensajes' => [
        'smtp' => ['user' => 'no-responder@tu-dominio.mx', 'pass' => 'contraseña del buzón'],
        'twilio' => ['sid' => 'ACxxxxxxxx', 'token' => 'token', 'de' => '+15550000000'],
    ],
];
