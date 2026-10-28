<?php
// Verificación en dos pasos: TOTP (RFC 6238, 30 s, 6 dígitos, SHA-1, como Google Authenticator)
// y cifrado del secreto con app_key (AES-256-GCM) para que un respaldo de la BD no baste para generar códigos.

const TOTP_PASO = 30;
const TOTP_DIGITOS = 6;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Codificar(string $datos): string {
    $bits = '';
    foreach (str_split($datos) as $c) $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
    $salida = '';
    foreach (str_split($bits, 5) as $trozo) $salida .= BASE32[bindec(str_pad($trozo, 5, '0'))];
    return $salida;
}

function base32Decodificar(string $texto): string {
    $texto = strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $texto));
    $bits = '';
    foreach (str_split($texto) as $c) $bits .= str_pad(decbin(strpos(BASE32, $c)), 5, '0', STR_PAD_LEFT);
    $salida = '';
    foreach (str_split($bits, 8) as $byte) if (strlen($byte) === 8) $salida .= chr(bindec($byte));
    return $salida;
}

function totpCodigo(string $secreto, int $paso): string {
    $hmac = hash_hmac('sha1', pack('J', $paso), base32Decodificar($secreto), true);
    $o = ord($hmac[19]) & 0x0f;
    $n = ((ord($hmac[$o]) & 0x7f) << 24) | (ord($hmac[$o + 1]) << 16) | (ord($hmac[$o + 2]) << 8) | ord($hmac[$o + 3]);
    return str_pad((string)($n % 10 ** TOTP_DIGITOS), TOTP_DIGITOS, '0', STR_PAD_LEFT);
}

// Acepta el paso actual ±1 (relojes desfasados) y devuelve el paso usado, o null.
// $ultimo evita reutilizar un código ya aceptado.
function totpVerificar(string $secreto, string $codigo, ?int $ultimo = null): ?int {
    if (!preg_match('/^\d{6}$/', $codigo = preg_replace('/\s+/', '', $codigo))) return null;
    $actual = intdiv(time(), TOTP_PASO);
    foreach ([0, -1, 1] as $d) {
        $paso = $actual + $d;
        if ($ultimo !== null && $paso <= $ultimo) continue;
        if (hash_equals(totpCodigo($secreto, $paso), $codigo)) return $paso;
    }
    return null;
}

function totpNuevoSecreto(): string {
    return base32Codificar(random_bytes(20));
}

function totpUri(string $secreto, string $cuenta): string {
    return 'otpauth://totp/' . rawurlencode('Bátiz:' . $cuenta) . '?secret=' . $secreto . '&issuer=' . rawurlencode('Bátiz') . '&digits=6&period=30';
}

function llaveApp(): string {
    global $CONFIG;
    $llave = base64_decode($CONFIG['app_key'] ?? '', true);
    if (!$llave || strlen($llave) !== 32) throw new RuntimeException('Falta app_key (32 bytes en base64) en la configuración.');
    return $llave;
}

function cifrar(string $texto): string {
    $iv = random_bytes(12);
    $c = openssl_encrypt($texto, 'aes-256-gcm', llaveApp(), OPENSSL_RAW_DATA, $iv, $tag);
    return 'v1:' . base64_encode($iv . $tag . $c);
}

function descifrar(string $guardado): ?string {
    if (!str_starts_with($guardado, 'v1:')) return null;
    $b = base64_decode(substr($guardado, 3), true);
    if ($b === false || strlen($b) < 29) return null;
    $t = openssl_decrypt(substr($b, 28), 'aes-256-gcm', llaveApp(), OPENSSL_RAW_DATA, substr($b, 0, 12), substr($b, 12, 16));
    return $t === false ? null : $t;
}

// Códigos de recuperación: se muestran una vez y se guardan con hash. Cada uno sirve una sola vez.
function codigosRecuperacion(): array {
    return array_map(fn() => implode('-', str_split(strtolower(base32Codificar(random_bytes(5))), 4)), range(1, 10));
}
