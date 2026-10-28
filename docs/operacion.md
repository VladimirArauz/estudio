# Operación

## Arranque
Ver «Arranque rápido» en el README. Tras reiniciar la PC basta con `sudo /opt/lampp/lampp start`;
`estudio-tunel` y `estudio-worker` arrancan solos.

## Comprobaciones
| Comando | Esperado |
|---|---|
| `curl http://localhost/estudio/api/salud.php` | `{"db":"ok"}` |
| `systemctl is-active estudio-tunel estudio-worker` | `active` dos veces |
| `make pruebas-e2e` / `make pruebas-seguridad` | todo en verde |

## Respaldos
Ver `bin/respaldar.sh` (BD de IONOS + storage, cifrados y con rotación) y su timer de systemd.
Para restaurar en la BD de pruebas: `make restaurar-prueba ARCHIVO=…`.

## Secretos
Viven fuera de git: `config/config.local.php`, `config/tunel.local.json` y el archivo de secretos personal.
Nunca los imprimas en una terminal compartida ni los pegues en un chat.
