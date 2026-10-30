# Bátiz hasta la muerte · Plataforma de estudio

Sitio de estudio para la Voca 9 (CECyT 9 «Juan de Dios Bátiz»). Sitio estudiantil, no es oficial del IPN.

- **Estudio:** apuntes, tareas y exámenes por materia.
- **Apoyo:** asesores, material de apoyo y cursos de profesores (tipo classroom).
- **Preparación:** generador de exámenes con IA (Gemini) para la admisión al nivel superior.
- **Panel de control (admin):** usuarios, materias, contenido, postulaciones, cursos, exámenes, analítica y logs.

Todo archivo subido (PDF, Word, PowerPoint, Excel, texto, imagen, audio o video) se procesa con Python y se convierte en una página HTML. Audio y video se pueden reproducir y traen transcripción automática.

El diseño sigue `design.md` («Plano técnico de la Voca 9»): tokens en `styles/tokens.css`, componentes en `styles/components.css`.

## Arranque rápido

```bash
# 1. XAMPP (Apache + PHP-FPM)
sudo /opt/lampp/lampp start

# 2. Apache sirve solo public/ (una sola vez)
sudo ln -sfn "$PWD/public" /opt/lampp/htdocs/estudio

# 3. Túnel a la BD de IONOS y worker de archivos (servicios del sistema, una sola vez)
sudo bin/instalar-servicios.sh
```

Abre **https://localhost/estudio/** (HTTP redirige a HTTPS; ver `docs/servidor.md`).

Después de reiniciar la PC solo hace falta el paso 1: los servicios `estudio-tunel` y `estudio-worker` arrancan solos.

| Comando | Para qué |
|---|---|
| `systemctl status estudio-tunel estudio-worker` | Ver si el túnel y el worker están corriendo |
| `journalctl -u estudio-worker -f` | Ver en vivo qué archivo se está procesando |
| `curl https://localhost/estudio/api/salud.php` | Debe responder `{"db":"ok"}` |
| `bin/tunel.sh` | Abrir el túnel a mano (si no usas los servicios) |
| `sudo systemctl restart estudio-worker` | Reiniciar el worker (tras cambiar el procesador) |
| `make auditoria-deps` | Buscar vulnerabilidades conocidas en las dependencias de Python |
| `/opt/lampp/bin/php bin/migrar.php` | Crear o actualizar las tablas (`sql/*.sql`) |
| `/opt/lampp/bin/php bin/crear-admin.php correo "Nombre" [contraseña]` | Crear o restablecer un admin |
| `/opt/lampp/bin/php bin/probar-mensaje.php destino@correo.com` | Probar el envío de códigos por correo |

## Base de datos (IONOS)

La BD MariaDB «Estudios» está en IONOS y **solo es visible desde el hosting de IONOS**: su nombre (`db…hosting-data.io`) no existe fuera de su red. Por eso `bin/tunel.sh` abre un túnel SSH a través del webspace:

```
PHP (localhost) → 127.0.0.1:3307 → SSH al webspace de IONOS → BD:3306
```

Cada consulta tarda ~150 ms de ida y vuelta. Por eso la API usa conexión persistente, *prepares* emulados y junta datos en pocas consultas (ver `src/db.php`).

## Secretos (nunca van en git)

| Archivo | Contenido |
|---|---|
| `config/config.local.php` | Credenciales de la BD, API key de Gemini y envío de correo (`mensajes`, ver `docs/operacion.md`). Plantilla: `config/config.ejemplo.php` |
| `config/tunel.local.json` | Usuario y contraseña SSH de IONOS para el túnel |
| `config/admin-inicial.txt` | Contraseña del primer admin (solo en una instalación nueva). **Cámbiala** en *Mi cuenta* y borra este archivo |

Apache solo sirve `public/`; `config/`, `src/`, `bin/`, `sql/`, `procesador/` y `storage/` quedan fuera del sitio. Como segunda capa, esas carpetas y todo lo que empieza con punto (`.git`, `.user.ini`…) también están bloqueados con `.htaccess`.

### Activar la IA (Gemini)

1. Crea una API key en https://aistudio.google.com/apikey.
2. Pégala en `config/config.local.php` → `'gemini' => ['key' => '…']`.

Sin key, Preparación usa el banco local de preguntas (`scripts/banco.js`).

### Guías para el examen de admisión

En *Panel de control → Guías de examen* el admin sube manuales o guías (PDF, Word, PowerPoint, Excel o texto) y les asigna una materia del examen (o «General»). El worker guarda el texto de cada guía en `storage/generados/{uuid}/texto.txt`, y `api/ia.php` mete en el prompt los fragmentos que más se relacionan con la materia y el tema pedidos (hasta ~24 000 caracteres). El simulacro usa todas las guías. Las páginas escaneadas sin texto no se pueden leer (no hay OCR).

## Materias

`sql/003_materias_cecyt9.sql` carga las materias de los mapas curriculares oficiales del CECyT 9 (tronco común y las carreras de Técnico en Programación, Mecatrónica, Sistemas Digitales y Desarrollo de Software), agrupadas por `area`. Las seriadas (Física I–IV, Inglés I–VI…) van juntas en una sola materia.

> La key que estaba en el repo público `ECO_Preparaci-n` (archivo `.env`) quedó expuesta: revócala en AI Studio y no la reutilices.

## Roles

| Rol | Qué puede hacer |
|---|---|
| Invitado (sin sesión) | Ver todo el contenido público y practicar en Preparación sin guardar resultados |
| Alumno | Subir apuntes, tareas, exámenes y material de apoyo; inscribirse a cursos, entregar, resolver exámenes, ver su desempeño y evaluar curso y profesor |
| Profesor | Lo de alumno + postularse a una materia; con la postulación aprobada abre cursos, sube material, crea actividades, califica, genera exámenes con IA y ve resultados y estadísticas |
| Admin | Todo + panel de control (`panel.html`) |

Al registrarse se elige alumno o profesor. Los admin solo se crean con `bin/crear-admin.php` o desde el panel.

## Cómo funciona el procesamiento de archivos

1. `api/subir.php` valida el rol, la extensión (lista blanca) y el contenido real (finfo). Guarda en `storage/originales/` y deja la fila en `archivos` con estado `pendiente`.
2. `procesador/worker.py` toma la cola, elige el procesador según el tipo y escribe `storage/generados/{uuid}/contenido.html` y sus recursos.

| Tipo | Procesador | Resultado |
|---|---|---|
| PDF | `pdf.py` (PyMuPDF) | Texto por secciones con índice, viñetas, imágenes y folio de página; las páginas escaneadas se muestran como imagen |
| Word / ODT / RTF | `documento.py` (python-docx; LibreOffice convierte .doc) | Títulos, listas, tablas e imágenes en orden |
| PowerPoint / ODP | `presentacion.py` | Imagen de cada diapositiva + texto y notas del orador |
| Excel / ODS / CSV | `hoja.py` | Una tabla por hoja |
| Texto / Markdown / código | `texto.py` | Lectura cómoda o código con resaltado |
| Imagen | `imagen.py` | Versión web optimizada y metadatos |
| Audio | `medios.py` | Reproductor, forma de onda y transcripción con marcas de tiempo (faster-whisper) |
| Video | `medios.py` | MP4 web, póster, 8 «momentos» y transcripción sincronizada |

El worker corre **aislado** (usuario `estudio-worker`, ver `bin/systemd/estudio-worker.service`): solo ve `procesador/` (lectura) y `storage/`, no tiene salida a internet (solo `localhost` para la BD), recibe únicamente las credenciales de la BD (`/etc/estudio/worker.env`, solo root) y tiene tope de memoria, procesos y tiempo por archivo. Rechaza Office/OpenDocument que se inflan demasiado al descomprimir e imágenes de más de 60 MP. `sudo bin/worker-pruebas.sh` lo corre igual de aislado contra el entorno de pruebas.

Todo el HTML generado pasa por `bleach` con una lista blanca de etiquetas. Los archivos se sirven con `api/archivo.php`, que comprueba permisos y soporta Range para adelantar audio y video.

Variables opcionales del worker: `ESTUDIO_WHISPER` (modelo; `base` por defecto, `small` transcribe mejor pero tarda unas 3 veces más) y `ESTUDIO_MAX_TRANSCRIPCION_MIN` (90 por defecto).

## Estructura

```
public/      lo único que sirve Apache (htdocs/estudio → estudio/public)
  *.html     index, materia, preparacion, cursos, curso, panel, login, ver
  styles/    tokens.css (copia literal de design.md §3) · base.css · components.css · vista.css
  scripts/   nav.js (índice de láminas) · api.js · util.js (incluye Esqueleto: pantallas de carga) · otp.js (input de código)
             · subir.js · examen.js · banco.js · una por página
  api/       endpoints PHP: auth, materias, archivos, subir, archivo, ia, cursos, admin, visita, salud
src/         PHP compartido por los endpoints: comun.php (sesión, CSRF, roles), db.php, archivos.php,
             codigos.php (códigos de verificación), mensajes.php (correo SMTP)
config/      config.php (+ config.local.php y tunel.local.json, fuera de git)
procesador/  worker.py + procesadores/ (Python, venv en procesador/.venv)
sql/         esquema y datos iniciales
bin/         túnel, migraciones, crear admin, probar envío de mensajes, servicios systemd
storage/     originales/ y generados/ (fuera de git)
tests/       e2e/ (Playwright) y seguridad/ (pruebas de controles)
docs/        arquitectura y operación
```

## Seguridad

- Contraseñas con bcrypt (costo fijo 12) y política: mínimo 10 caracteres, sin las 10 000 más comunes ni el nombre o correo.
- Verificación en dos pasos (TOTP) en «Mi cuenta»; **obligatoria para admin** (sin ella no hay privilegios de admin).
  El secreto se guarda cifrado con `app_key` (AES-256-GCM) y hay 10 códigos de recuperación de un solo uso.
- Alumnos y profesores pueden usar en su lugar un **código por correo** al entrar (solo con el correo verificado).
  Los admin solo usan la app.
- **Códigos de verificación** (`src/codigos.php`): 6 dígitos, se guarda solo su HMAC con `app_key`, caducan a los 10 min,
  se usan una vez, 5 intentos por código, 60 s entre envíos y tope por cuenta y por conexión.
  Sirven para verificar el correo, para el segundo paso al entrar y para «¿Olvidaste tu contraseña?»
  (que responde igual, y en el mismo tiempo, exista o no la cuenta).
- Las cuentas nuevas deben verificar su correo antes de
  subir, postularse o inscribirse; las que existían antes de esto no se bloquean (`requiere_verificar = 0`).
- Sesión: cookie `Secure` + HttpOnly + SameSite=Lax, regenerada al entrar y al cambiar de rol; caduca a los 30 min sin uso
  y a las 12 h (2 h para admin). Cambiar o restablecer la contraseña, o suspender la cuenta, cierra las demás sesiones.
- Cambiar roles, suspender, restablecer contraseñas y borrar lo de otros pide confirmar la contraseña (y el 2FA).
- Límites por conexión y por cuenta (`limitar()`): login sin bloqueo de cuentas ajenas, registro, subidas
  (cuota diaria), IA (solo con sesión), postulaciones; respuesta uniforme exista o no el correo.
- Token CSRF en todo POST.
- Consultas preparadas; permisos por rol en cada endpoint (`requiereRol`, `esProfesorDe`, `estaInscrito`).
- Los exámenes de curso se califican en el servidor: el alumno no recibe las respuestas hasta terminar y solo cuenta el primer intento.
- CSP estricta (`script-src 'self'`, sin scripts en línea), `X-Frame-Options: DENY` y `nosniff`.
