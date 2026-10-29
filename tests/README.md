# Pruebas

Corren contra el **entorno de pruebas**: `https://localhost:8443/estudio/` (vhost de Apache que solo escucha en
127.0.0.1, con `SetEnv ESTUDIO_ENTORNO pruebas`). Ese entorno usa `config/config.pruebas.php`: BD local
`estudio_pruebas` en el MySQL de XAMPP, `storage-pruebas/` y Gemini simulado. `config/config.php` aborta si la
configuración de pruebas apunta al túnel de producción. **Nunca corren contra IONOS.**

```bash
python3 -m venv tests/.venv && tests/.venv/bin/pip install -r tests/requirements.txt
make pruebas-seguridad   # controles: sesión, 2FA, CSRF, permisos, subidas, cabeceras…
make pruebas-e2e         # recorrido de cada sección en Chrome (Playwright)
```

- `tests/herramientas/preparar.php` vacía la BD de pruebas, crea usuarios por rol y vacía los límites
  (se niega a correr fuera del entorno de pruebas).
- Las pruebas de 2FA calculan el código TOTP en Python; algunas esperan al siguiente paso de 30 s.
- Los códigos por correo o SMS no se envían: el entorno de pruebas los escribe en `storage-pruebas/buzon.jsonl`
  y `ayuda.ultimo_codigo(destino)` los lee. `preparar.php caducar <id>` vence los códigos de una cuenta.
- Algunas pruebas esperan 61 s (la sesión relee al usuario de la BD cada 60 s).
