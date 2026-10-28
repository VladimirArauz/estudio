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
