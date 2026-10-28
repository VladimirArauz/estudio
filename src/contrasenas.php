<?php
// Política de contraseñas: largo mínimo, nada de las más comunes ni del correo o nombre de la persona.

const PASSWORD_MIN = 10;
// Costo fijo de bcrypt en todo el proyecto (la web usa PHP 8.5 y la consola el 8.2 de XAMPP, con costos por
// defecto distintos). Si los hashes tuvieran costos distintos, el tiempo del login delataría qué correos existen.
const HASH_OPCIONES = ['cost' => 12];

function hashContrasena(string $pass): string {
    return password_hash($pass, PASSWORD_BCRYPT, HASH_OPCIONES);
}

// Devuelve el problema en lenguaje claro, o null si la contraseña sirve.
function problemaContrasena(string $pass, string $email = '', string $nombre = ''): ?string {
    if (mb_strlen($pass) < PASSWORD_MIN) return 'La contraseña debe tener al menos ' . PASSWORD_MIN . ' caracteres.';
    if (mb_strlen($pass) > 200) return 'La contraseña es demasiado larga (máximo 200 caracteres).';
    $p = mb_strtolower($pass);
    if (count(array_unique(mb_str_split($p))) < 4) return 'La contraseña repite demasiado los mismos caracteres.';
    static $comunes = null;
    $comunes ??= array_flip(array_filter(file(__DIR__ . '/datos/contrasenas-comunes.txt', FILE_IGNORE_NEW_LINES), fn($l) => $l !== '' && $l[0] !== '#'));
    // También con números o símbolos al final («password123!»).
    if (isset($comunes[$p]) || isset($comunes[rtrim($p, "0123456789!.@#$%&*_-")])) return 'Esa contraseña es de las más usadas y fáciles de adivinar. Elige otra.';
    $usuario = mb_strtolower(explode('@', $email)[0] ?? '');
    if (mb_strlen($usuario) >= 4 && str_contains($p, $usuario)) return 'La contraseña no debe contener tu correo.';
    foreach (preg_split('/\s+/', mb_strtolower($nombre)) as $parte) {
        if (mb_strlen($parte) >= 4 && str_contains($p, $parte)) return 'La contraseña no debe contener tu nombre.';
    }
    return null;
}
