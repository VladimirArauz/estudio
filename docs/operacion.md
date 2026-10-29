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

## Códigos de verificación (correo y SMS)
Se mandan al registrarse (verificar el correo o el teléfono), al entrar si la cuenta eligió «código por correo/SMS»
y en «¿Olvidaste tu contraseña?». Las credenciales van en `config/config.local.php` (fuera de git):

```php
'mensajes' => [
    'smtp' => ['user' => 'no-responder@tu-dominio.mx', 'pass' => '…'],   // buzón de IONOS; host smtp.ionos.mx:587 por defecto
    'twilio' => ['sid' => 'AC…', 'token' => '…', 'de' => '+1…'],         // opcional: sin sid no se ofrece SMS
],
```

- **Correo**: crea un buzón en IONOS (p. ej. `no-responder@…`) y revisa que el dominio tenga SPF y DKIM activos
  para que los correos no caigan en spam.
- **SMS** (opcional): cuenta de Twilio con un número que pueda mandar a México. **Cada SMS cuesta**; por eso hay
  tope de 3 por hora y 10 por día por cuenta. La cuenta de prueba de Twilio solo manda a números verificados.
- Probar la configuración: `/opt/lampp/bin/php bin/probar-mensaje.php correo tu@correo.com` (o `sms +5255…`).
- Envíos fallidos: quedan en la tabla `logs` con acción `envio_fallido` (sin el código) y en el log de PHP
  (`[estudio] Envío por … falló`). Nunca se registra el texto del mensaje.
- En el entorno de pruebas no sale nada: los mensajes se escriben en `storage-pruebas/buzon.jsonl`.

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
