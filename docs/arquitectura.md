# Arquitectura

```
Navegador ──HTTP(S)──► Apache (XAMPP) ──► public/        páginas estáticas + scripts/ + styles/
                                      └─► public/api/*.php ─► src/comun.php (sesión, CSRF, roles)
                                                           └─► src/db.php ─► 127.0.0.1:3307
                                                                              │ túnel SSH (estudio-tunel)
                                                                              ▼
                                                                  MariaDB «Estudios» en IONOS

public/api/subir.php ──► storage/originales/{uuid}.ext  +  fila en `archivos` (estado «pendiente»)
estudio-worker (procesador/worker.py) ──► toma pendientes ──► storage/generados/{uuid}/contenido.html
public/api/archivo.php ──► sirve originales, vistas y recursos comprobando permisos (puedeVer)
public/api/ia.php ──► Gemini (generativelanguage.googleapis.com) con caché y límite diario
```

- **Solo `public/` es accesible por HTTP.** `src/`, `config/`, `sql/`, `bin/`, `procesador/` y `storage/`
  están fuera del sitio; además tienen `.htaccess` con `Require all denied` como segunda capa.
- **Todo POST** pasa por `exigirPost()` (token CSRF de la sesión en la cabecera `X-CSRF`).
- **Permisos:** `requiereRol()`, `esProfesorDe()`, `estaInscrito()` y `puedeVer()` / `puedeBorrar()`.
- **Archivos no confiables:** el worker los convierte a HTML y todo lo que genera pasa por `bleach`.
  `archivo.php` los sirve con una CSP propia con `sandbox`.
