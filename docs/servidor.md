# Configuración del servidor (XAMPP + PHP-FPM)

Cambios hechos fuera del repo. Cada archivo tocado tiene una copia `.bak-AAAAMMDD` junto a él
(el pool de PHP-FPM, en `/root/xampp.conf.bak-AAAAMMDD`). Para revertir, restaura la copia y reinicia
(`sudo /opt/lampp/lampp restart`, `sudo systemctl restart php8.5-fpm`).

## Red
- MySQL de XAMPP: `bind-address=127.0.0.1` (`/opt/lampp/etc/my.cnf`); root, pma con contraseña;
  sin usuario anónimo ni BD `test`. phpMyAdmin pide usuario y contraseña (`auth_type = cookie`).
- ProFTPD apagado y sin arranque automático (`/opt/lampp/etc/xampp/startftp` eliminado).
- `ufw`: entrantes denegadas, salientes permitidas. Para ver el sitio desde otro equipo de la red:
  `sudo ufw allow from 192.168.0.0/24 to any port 443 proto tcp`.

## Apache (`/opt/lampp/etc`)
- `ServerTokens Prod`, `TraceEnable Off`, `Timeout 120`, `LimitRequestBody` 220 MB, solo GET/POST/HEAD/OPTIONS.
- Módulos desactivados: perl, cgi/cgid, suexec, autoindex, status, info, dav/dav_fs, userdir, speling,
  include y filtros de prueba. Sin alias `/bitnami`. `htdocs` con `Options FollowSymLinks` solamente.
- `/dashboard`, `/webalizer`, `/img`, `applications.html`, `cgi-bin`: solo desde esta PC.
- TLS 1.2/1.3 con cifrados AEAD. Certificado propio de mkcert para `localhost`, `127.0.0.1`, `::1`
  y la IP de la red (CA en `~/.local/share/mkcert`, instalada en el sistema y en Chrome).
  Para otro equipo, instala ahí `rootCA.pem` (nunca compartas `rootCA-key.pem`).

## PHP-FPM (`/etc/php/8.5/fpm/pool.d/xampp.conf`, usuario `daemon`)
- Sesiones en `/var/lib/php/sesiones-xampp` (700), `use_strict_mode`, `use_only_cookies`,
  `cookie_httponly`, `SameSite=Lax`.
- `disable_functions` (exec, shell_exec, system, passthru, proc_open, popen, pcntl_exec),
  `open_basedir` limitado a los proyectos, phpMyAdmin y temporales, errores a
  `/var/log/php-xampp-error.log`.

## Sitio (`public/.htaccess`)
- HTTP → HTTPS (308), CSP sin scripts en línea, COOP/CORP, `nosniff`, `X-Frame-Options`,
  `Permissions-Policy`. HSTS solo con un dominio real (en `localhost` afectaría a otros puertos).
- Deuda conocida: la CSP aún permite `style-src 'unsafe-inline'` (62 `style=""` en páginas y scripts).

## Pendiente de actualizar
XAMPP 8.2.12 trae Apache 2.4.58 y OpenSSL 1.1.1w (sin soporte). El PHP que atiende la web es el 8.5
del sistema, que sí está al día. Lo recomendable es pasar a Apache y MariaDB del sistema (paquetes de
Ubuntu, con actualizaciones de seguridad) y dejar XAMPP.
