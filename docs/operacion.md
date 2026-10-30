# Operación

## Arranque
Ver «Arranque rápido» en el README. Tras reiniciar la PC basta con `sudo /opt/lampp/lampp start`;
`estudio-tunel` y `estudio-worker` arrancan solos.

## Comprobaciones
| Comando | Esperado |
|---|---|
| `curl https://localhost/estudio/api/salud.php` | `{"db":"ok"}` |
| `systemctl is-active estudio-tunel estudio-worker` | `active` dos veces |
| `make pruebas-e2e` / `make pruebas-seguridad` | todo en verde |

## Respaldos
- `estudio-respaldo.timer` corre `bin/respaldar.sh` cada día a las 03:30 (o al prender la PC si se perdió):
  volcado de la BD de IONOS + `storage/`, cifrados con `age` y la llave **pública** `/etc/estudio/respaldos.pub`.
  Quedan en `~/respaldos/automaticos/` y se conservan 14 días.
- La llave **privada** está en `~/.config/estudio-respaldos/llave-privada.txt` (solo lectura para ti).
  **Copia ese archivo a un lugar fuera de esta PC** (USB, gestor de contraseñas): sin él los respaldos no se
  pueden abrir, y si se pierde el disco se pierden ambos.
- Respaldo manual: `sudo make respaldar`. Prueba de restauración (en la BD local de pruebas, nunca en IONOS):
  `sudo make restaurar-prueba ARCHIVO=~/respaldos/automaticos/estudio-bd-AAAAMMDD-HHMM.sql.gz.age`.
- Restaurar en producción (solo ante una pérdida real): `age -d -i <llave-privada> <archivo> | gunzip | mysql …`
  contra la BD de IONOS por el túnel.

## Códigos de verificación (correo)
Se mandan al registrarse (verificar el correo), al entrar si la cuenta eligió «código por correo»
y en «¿Olvidaste tu contraseña?». Las credenciales van en `config/config.local.php` (fuera de git):

```php
'mensajes' => [
    'smtp' => ['user' => 'tucorreo@gmail.com', 'pass' => '…'],   // contraseña de aplicación; smtp.gmail.com:587 por defecto
],
```

- **Gmail**: activa la verificación en dos pasos de la cuenta de Google y crea una **contraseña de aplicación**
  en myaccount.google.com → Seguridad → Contraseñas de aplicaciones. Esa clave de 16 letras (sin espacios) va en `pass`;
  la contraseña normal de Google no sirve para SMTP.
- El remitente es la misma cuenta: deja `de` vacío (Gmail reescribe cualquier otro remitente). `de_nombre` sí se puede cambiar.
- Límite de Gmail: unos **500 correos al día**. Si se llega al límite, los envíos fallan hasta el día siguiente
  (quedan en `envio_fallido`). Los primeros correos pueden llegar a spam: márcalos como «No es spam».
- Probar la configuración: `/opt/lampp/bin/php bin/probar-mensaje.php tu@correo.com`.
- Envíos fallidos: quedan en la tabla `logs` con acción `envio_fallido` (sin el código) y en el log de PHP
  (`[estudio] Envío de correo falló`). Nunca se registra el texto del mensaje.
- En el entorno de pruebas no sale nada: los correos se escriben en `storage-pruebas/buzon.jsonl`.
- **Sin credenciales de SMTP** el sitio sigue funcionando como antes: no se pide verificar la cuenta,
  no aparece «¿Olvidaste tu contraseña?» ni el código por correo. Al poner `user` y `pass` se activa todo solo.

## Vista previa al compartir (Open Graph)
Lo que muestran WhatsApp y las redes al mandar un enlace: título, descripción e imagen de 1200×630
(`public/img/vista-previa.png`). Las etiquetas viven en cada `public/*.html` entre `<!-- vista-previa -->` y
`<!-- /vista-previa -->`; no las edites a mano.

- Textos de cada página: `bin/vista-previa.php` (`PAGINAS`). Después de cambiarlos: `/opt/lampp/bin/php bin/vista-previa.php`.
- **Cuando haya dominio**: pon la dirección pública en `config/config.php` → `'sitio' => ['url' => 'https://…/estudio']`
  y corre `/opt/lampp/bin/php bin/vista-previa.php`. Sin ella falta `og:url` y la imagen no es absoluta, y WhatsApp no la muestra.
- Regenerar la imagen: `tests/.venv/bin/python bin/vista-previa-imagen.py` (la dibuja Chrome con las fuentes del sitio).
- Probar: el depurador de Meta (developers.facebook.com/tools/debug) muestra la vista previa y limpia su caché.
  WhatsApp guarda la vista previa de un enlace un buen rato: para ver un cambio, prueba con `?v=2` al final.

## Logs
`/etc/logrotate.d/estudio` rota cada semana los logs de Apache (`/opt/lampp/logs`) y de PHP
(`/var/log/php-xampp-error.log`) y guarda 8 semanas.

## Revisión mensual
- `make auditoria-deps` (pip-audit) y actualizar lo que salga.
- `sudo make pruebas` (lint + seguridad + E2E) después de cualquier cambio.
- Buscar actualizaciones de XAMPP y del sistema (`sudo apt upgrade`).
- `gitleaks git .` para comprobar que no se haya colado ningún secreto en git.

## Secretos
Viven fuera de git: `config/config.local.php`, `config/tunel.local.json` y el archivo de secretos personal.
Nunca los imprimas en una terminal compartida ni los pegues en un chat.
