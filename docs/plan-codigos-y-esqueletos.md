# Plan: códigos de verificación (correo/SMS), input OTP animado y pantallas esqueleto

> **Nota (2026-10-29):** el SMS y el teléfono se descartaron después de este plan; los códigos solo se mandan por correo
> (Gmail). Ver `sql/007_sin_sms.sql`. Lo que este documento dice del SMS, Twilio o el teléfono es historia.

Origen: dos reels de Instagram.

| Reel | Qué dice | Cómo se aplica aquí |
|---|---|---|
| **@jiron.design** · «Deja de usar spinners para cargar tus pantallas» | El spinner es lo más fácil para indicar que algo carga, pero hay otra forma que además hace que la carga **se sienta más rápida**: las *skeleton screens* (siluetas grises con la forma del contenido final). En los comentarios hay una advertencia: los esqueletos se ven falsos si no se parecen al contenido real y cuestan mantenerlos. | Hoy cada página muestra un texto `Cargando…` (`.cargando` en `components.css:340`) mientras llegan los datos por el túnel (~150 ms por consulta). Se cambia por esqueletos con la forma real de cada lista o tarjeta. |
| **@anees05it** · «Animated OTP input from scratch» | Input de código hecho solo con HTML, CSS y JS: ✅ pasa solo al siguiente dígito · ✅ animación *pop* en cada dígito · ✅ código incorrecto → rojo + *shake* + se limpia solo · ✅ código correcto → brillo verde + estado «verificado». | Componente `otp.js` reutilizable para el 2FA que ya existe (`#codigoEntrar`, `#codigoActivar`) y para los **códigos nuevos por correo o SMS**. |

Además pediste:
- Mandar un **código de verificación al teléfono registrado o al correo**.
- Agregar el **teléfono como campo al registrarse** (hoy `usuarios` no lo tiene).
- Aplicar los cambios de BD en **producción** (IONOS).

---

## Decisiones de diseño (léelas antes de correr los prompts)

1. **Dónde se usa el código** (todas con el mismo servicio `src/codigos.php`):
   - **Verificar el correo o el teléfono** al crear la cuenta.
   - **Segundo paso al entrar** por correo o SMS, como alternativa al TOTP para alumnos y profesores.
     **Los admin siguen con TOTP obligatorio**: el SMS se puede interceptar (SIM swapping) y no debe bajar la seguridad del panel.
   - **«¿Olvidaste tu contraseña?»**: hoy no existe y es el uso más natural de un código por correo o SMS.
2. **Proveedores**:
   - Correo: el **SMTP de IONOS** (ya pagas el hosting; incluye buzones), con PHPMailer copiado a `src/vendor/` con versión fija, igual que `qrcode.min.js` (el proyecto no usa Composer).
   - SMS: la **API REST de Twilio** con `curl`, igual que `ia.php` llama a Gemini. El SMS **cuesta por mensaje**, y la cuenta de prueba de Twilio solo manda a números verificados. Alternativa: Brevo, que hace correo y SMS con una sola cuenta.
   - En pruebas no se envía nada (`'simulado' => true`): los mensajes van a `storage-pruebas/buzon.jsonl` y las pruebas leen el código de ahí.
3. **Teléfono**: es opcional al registrarse, pero si lo escriben se valida. Se guarda en formato E.164 (`+52` + 10 dígitos para México). Las cuentas que ya existen pueden agregarlo en «Mi cuenta».
4. **Cuentas existentes**: no se bloquean. Columna nueva `requiere_verificar`: las filas actuales quedan en `0` y solo las cuentas nuevas entran con `1`. Mientras una cuenta nueva no verifique su contacto, puede ver todo pero **no puede subir, postularse ni inscribirse**.
5. **Seguridad del código**:
   - 6 dígitos con `random_int`.
   - Se guarda solo el `hash_hmac('sha256', …, app_key)`, nunca el código en claro.
   - Caduca a los 10 min y se usa una sola vez (UPDATE atómico con `usado IS NULL`).
   - Máximo 5 intentos por código; reenviar tiene 60 s de espera.
   - Tope diario por cuenta y por IP con `limitar()`, más bajo para SMS por el costo.
   - Respuesta uniforme exista o no la cuenta (recuperación), y el destino enmascarado (`a•••@gmail.com`, `•••• 5678`).
6. **BD de producción**: solo cambios **aditivos e idempotentes** (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`). El código que corre hoy los ignora, así que la migración se puede aplicar antes de desplegar lo demás. Siempre **después de un respaldo** (`sudo bin/respaldar.sh`) y **después de probarla en `estudio_pruebas`**.

---

## Fases

| # | Fase | Toca la BD de producción |
|---|---|---|
| 1 | Migración 006 (teléfono, verificación, tabla de códigos): pruebas → respaldo → producción | **Sí** |
| 2 | Envío de mensajes (`src/mensajes.php`: SMTP IONOS + Twilio + buzón simulado) | No |
| 3 | Servicio de códigos (`src/codigos.php`) + endpoints | No |
| 4 | Componente OTP animado (`otp.js` + CSS) y cambio de los inputs de 2FA actuales | No |
| 5 | Registro con teléfono y verificación del contacto | No |
| 6 | Segundo paso por correo/SMS y «¿Olvidaste tu contraseña?» | No |
| 7 | Pantallas esqueleto en lugar de `Cargando…` | No |
| 8 | Pruebas de seguridad y e2e, documentación | No |
| 9 | Puesta en producción: credenciales reales, prueba manual, cierre | Verificación |

Cada prompt está escrito para pegarse tal cual en una sesión nueva de Claude Code, desde la raíz del proyecto.

---

### Prompt 1 · Migración de BD (pruebas y luego producción)

```text
Lee README.md, sql/001_esquema.sql, sql/004_seguridad.sql y bin/migrar.php para seguir el estilo.

Crea sql/006_verificacion.sql (MariaDB, idempotente y SOLO aditivo: nada de DROP, MODIFY ni UPDATE masivos):
- usuarios: telefono VARCHAR(16) NULL (E.164, p. ej. +525512345678) con INDEX;
  email_verificado DATETIME NULL; telefono_verificado DATETIME NULL;
  requiere_verificar TINYINT(1) NOT NULL DEFAULT 0 (las filas existentes quedan en 0, el registro nuevo pondrá 1);
  segundo_factor ENUM('totp','correo','sms') NULL (NULL = sin segundo paso; TOTP se sigue leyendo de totp_activo).
- Tabla codigos_verificacion: id, usuario_id (FK a usuarios ON DELETE CASCADE),
  proposito ENUM('verificar_correo','verificar_telefono','login','recuperar'), canal ENUM('correo','sms'),
  destino VARCHAR(190), codigo_hash CHAR(64), intentos TINYINT UNSIGNED DEFAULT 0, expira DATETIME, usado DATETIME NULL,
  ip VARCHAR(45), creado DATETIME DEFAULT CURRENT_TIMESTAMP; INDEX (usuario_id, proposito, creado), INDEX (expira).
Usa ADD COLUMN IF NOT EXISTS y CREATE TABLE IF NOT EXISTS, con comentarios en español como en 004.

Pasos, en este orden. Detente y avísame si alguno falla:
1. Aplica en PRUEBAS: ESTUDIO_ENTORNO=pruebas /opt/lampp/bin/php bin/migrar.php. Córrelo dos veces para confirmar que es idempotente.
   Muestra DESCRIBE usuarios y DESCRIBE codigos_verificacion de la BD de pruebas.
2. Pídeme que corra el respaldo de producción (necesita root): "! sudo bin/respaldar.sh". Espera a que confirme que terminó bien.
3. Revisa que el túnel esté arriba (curl -s https://localhost/estudio/api/salud.php debe decir {"db":"ok"}).
4. Aplica en PRODUCCIÓN: /opt/lampp/bin/php bin/migrar.php (sin ESTUDIO_ENTORNO). Muestra el DESCRIBE de las dos tablas
   en producción y el número de filas de usuarios antes y después (debe ser el mismo).
5. Corre make pruebas-seguridad para confirmar que nada se rompió.
Haz commit: "Verificación fase 1: teléfono, verificación de contacto y tabla de códigos".
```

### Prompt 2 · Envío de correo y SMS

```text
Lee src/comun.php, config/config.php, config/config.ejemplo.php, config/config.pruebas.php y cómo public/api/ia.php llama a Gemini
con curl y con el modo 'simulado'.

Crea src/mensajes.php con:
- enviarCorreo(string $para, string $asunto, string $texto, string $html): bool
  por SMTP de IONOS (smtp.ionos.mx, 587, STARTTLS) usando PHPMailer copiado en src/vendor/PHPMailer/ (versión fija
  y estable; solo PHPMailer.php, SMTP.php y Exception.php, con su licencia en src/vendor/LICENCIAS.md). Sin Composer.
- enviarSms(string $telefonoE164, string $texto): bool con la API REST de Twilio (curl, timeout de 10 s, verificación TLS activa).
- Si $CONFIG['mensajes']['simulado'] es true, no se envía nada: se agrega una línea JSON {fecha, canal, destino, texto}
  a <storage>/buzon.jsonl. config.pruebas.php debe activarlo.
- Los errores del proveedor se registran con registrar() SIN el código ni el texto completo, y la función devuelve false.
Agrega a config.php los valores por defecto 'mensajes' => ['simulado' => false, 'smtp' => [host, port, user, pass, de, de_nombre],
'twilio' => [sid, token, de]] y documéntalos en config.ejemplo.php (los secretos van en config.local.php, nunca en git).
Plantilla del correo: texto plano + HTML sencillo con los colores de styles/tokens.css, sin imágenes remotas.
Crea bin/probar-mensaje.php (solo CLI) para mandarme un correo o SMS de prueba: php bin/probar-mensaje.php correo|sms destino.
Corre make lint. Haz commit: "Verificación fase 2: envío de correo (SMTP IONOS) y SMS (Twilio)".
```

### Prompt 3 · Servicio de códigos y endpoints

```text
Lee src/comun.php (limitar, registrar, ejecutar), public/api/auth.php, src/totp.php (cifrar/app_key) y src/mensajes.php.

Crea src/codigos.php:
- emitirCodigo(int $uid, string $proposito, string $canal): array → genera 6 dígitos con random_int, invalida los anteriores
  sin usar del mismo propósito, guarda hash_hmac('sha256', codigo, app_key), expira en 10 min y lo envía con mensajes.php.
  Espera de 60 s entre envíos. Límites con limitar(): por cuenta 5 correos/hora y 3 SMS/hora (10 SMS/día),
  por IP 20/hora. Devuelve ['destino' => enmascarado, 'reenviar_en' => segundos].
- verificarCodigo(int $uid, string $proposito, string $codigo): bool → compara con hash_equals, suma intentos
  (si llega a 5, el código se invalida) y lo marca usado con un UPDATE atómico (WHERE usado IS NULL AND expira > NOW()).
- enmascarar(): correo a•••@gmail.com, teléfono •••• 5678.
- normalizarTelefono(string): ?string → acepta 10 dígitos de México (antepone +52), +52…, o E.164 de otros países; si no, null.
Texto del mensaje: «Tu código de Bátiz hasta la muerte es 123456. Caduca en 10 minutos. Si no lo pediste, ignora este mensaje.»

En public/api/auth.php agrega acciones (todas con exigirPost y CSRF):
- codigo_enviar {proposito: verificar_correo|verificar_telefono, canal} (con sesión).
- codigo_verificar {proposito, codigo} → marca email_verificado o telefono_verificado.
- telefono_guardar {telefono} (con sesión; pide exigirReautenticacion si ya tenía uno; al cambiarlo, telefono_verificado = NULL).
'yo' debe regresar también telefono enmascarado, email_verificado, telefono_verificado, requiere_verificar y segundo_factor.
Agrega en src/comun.php requiereVerificado(): si requiere_verificar = 1 y no hay correo ni teléfono verificado,
fallar('Verifica tu correo o tu teléfono para continuar.', 403). Úsala en subir.php, en la postulación y en la inscripción a cursos.
Actualiza docs/autorizacion.md con las acciones nuevas. Corre make lint y make pruebas-seguridad.
Haz commit: "Verificación fase 3: servicio de códigos de un solo uso".
```

### Prompt 4 · Componente OTP animado (reel 2)

```text
Lee public/styles/tokens.css, components.css, base.css (prefers-reduced-motion), public/scripts/util.js y login.js.
Respeta la CSP: nada de scripts ni estilos en línea nuevos (style="" en HTML tampoco para lo nuevo).

Crea public/scripts/otp.js con una función global OTP.montar(contenedor, { largo: 6, alCompletar: async codigo => bool })
que pinte un input OTP como el del reel de @anees05it:
- 6 casillas <input inputmode="numeric" maxlength="1">, la primera con autocomplete="one-time-code".
- Pasa sola a la siguiente casilla al escribir; Backspace en una vacía regresa y borra; flechas izquierda/derecha.
- Pegar el código completo (o recibirlo por el autocompletado de SMS) llena todas las casillas.
- Animación "pop" (scale) en cada dígito escrito.
- Al completar llama alCompletar. Si regresa false o lanza error: casillas en rojo + "shake" + se limpian solas a los ~600 ms
  y el foco vuelve a la primera. Si regresa true: brillo verde y estado «Verificado» (con ícono check de util.js).
- Accesibilidad: role="group" con aria-label, cada casilla con aria-label "Dígito N de 6", mensaje en aria-live="polite",
  y con prefers-reduced-motion se quitan pop, shake y glow (solo cambia el color).
- Opción { alternativo: true }: enlace «Usar un código de recuperación» que cambia a un input de texto normal
  (los códigos de recuperación del TOTP tienen 10 caracteres).
CSS en components.css (.otp, .otp__casilla, .otp--error, .otp--ok) con los tokens existentes; nada de colores sueltos.
Usa OTP en login.js para #codigoEntrar (con alternativo) y #codigoActivar. Agrega <script src="scripts/otp.js"> en login.html.
Prueba en el entorno de pruebas (https://localhost:8443/estudio/login.html) que el 2FA actual sigue funcionando
(make pruebas-e2e -k cuenta). Haz commit: "Verificación fase 4: input OTP animado".
```

### Prompt 5 · Teléfono en el registro y verificación del contacto

```text
Lee public/login.html, public/scripts/login.js, public/scripts/otp.js, public/api/auth.php y src/codigos.php.

Registro:
- Agrega el campo «Teléfono (opcional)» en #formRegistro: type="tel", autocomplete="tel", inputmode="tel", ayuda
  «10 dígitos. Lo usaremos solo para mandarte códigos de verificación.». Valídalo en el cliente (10 dígitos o +código país).
- En auth.php 'registrar': lee telefono, normalízalo con normalizarTelefono (si viene y es inválido → 422 con un mensaje claro),
  inserta con requiere_verificar = 1.
- Después de registrarse, en lugar de ir a irDestino(), muestra un paso «Verifica tu cuenta»: elige canal (Correo / SMS,
  SMS solo si dio teléfono), manda el código (codigo_enviar), y muestra OTP.montar. Incluye «Reenviar código» con cuenta
  regresiva según reenviar_en, y «Hacerlo después» que lleva a irDestino().
«Mi cuenta» (pintar como pintarDosPasos):
- Sección «Correo y teléfono»: estado verificado o sin verificar de cada uno, botón Verificar (abre el mismo flujo OTP),
  agregar o cambiar teléfono (telefono_guardar; si ya tenía uno pide confirmar contraseña como las otras acciones delicadas).
- Si requiere_verificar y nada verificado, nav.js muestra un aviso discreto «Verifica tu cuenta» con enlace a login.html.
Corre make lint y la prueba e2e de cuenta. Haz commit: "Verificación fase 5: teléfono en el registro y verificación del contacto".
```

### Prompt 6 · Segundo paso por correo/SMS y recuperación de contraseña

```text
Lee public/api/auth.php (entrar, verificar_2fa, pendiente_2fa), src/codigos.php, public/scripts/login.js y otp.js.

Segundo paso por código:
- En «Mi cuenta», junto a la verificación en dos pasos, opción para alumno/profesor: «Código por correo» o «Código por SMS»
  (solo con ese contacto verificado), además del TOTP que ya existe. Guarda usuarios.segundo_factor. Activar o desactivar pide
  exigirReautenticacion(). Admin: solo TOTP (el servidor lo rechaza aunque se mande a mano).
- 'entrar': si segundo_factor es correo o sms (y no hay TOTP), emite el código de propósito 'login' y responde
  {paso: '2fa', metodo: 'correo'|'sms', destino}. 'verificar_2fa' acepta ese código con verificarCodigo; con TOTP no cambia nada.
  Mantén el límite de 5 min de pendiente_2fa y el límite de intentos.
- login.js: el texto del paso cambia según el método («Te mandamos un código a a•••@gmail.com»), con OTP.montar y «Reenviar».
Recuperar contraseña:
- Enlace «¿Olvidaste tu contraseña?» en #formEntrar → formulario con correo y canal (correo o SMS al teléfono registrado
  y verificado). 'recuperar_enviar' responde SIEMPRE lo mismo exista o no la cuenta («Si el correo está registrado, te llegó
  un código»), con limitar() por IP y por correo, y el mismo tiempo de respuesta en los dos casos.
- 'recuperar_cambiar' {email, codigo, nueva}: verifica el código, valida con problemaContrasena, guarda el hash, sube
  sesion_version (cierra las demás sesiones), registra 'password_recuperar' y NO inicia sesión sola si la cuenta tiene TOTP.
Corre make lint y make pruebas-seguridad. Haz commit: "Verificación fase 6: segundo paso por correo o SMS y recuperar contraseña".
```

### Prompt 7 · Pantallas esqueleto (reel 1)

```text
Lee public/styles/components.css (.cargando en la línea ~340), base.css (prefers-reduced-motion), util.js, nav.js, inicio.js,
materia.js, curso.js, ver.js, panel.js, y materia.html, curso.html, ver.html y panel.html.

Cambia los textos «Cargando…» por pantallas esqueleto con la forma real del contenido que aparecerá (idea del reel de
@jiron.design: hace que la carga se sienta más rápida que un spinner o un texto):
- CSS: .esqueleto (bloque con --bg-2/--borde de tokens.css y un brillo que recorre de izquierda a derecha),
  variantes .esqueleto--linea, --titulo, --tarjeta, --fila, --chip. Con prefers-reduced-motion: sin brillo, solo el bloque.
- util.js: esqueleto(tipo, cantidad) que regresa el HTML. El contenedor lleva aria-busy="true" y un texto solo para lectores
  de pantalla («Cargando materias…»); al llegar los datos se quita aria-busy.
- Aplícalo donde hoy hay .cargando o donde se espera a la API: tarjetas de materias e «Estudio» en inicio, encabezado y
  material de materia.html, curso.html (encabezado, material, actividades), ver.html, cada sección del panel y la cuenta del nav.
  Cada esqueleto debe medir lo mismo que el contenido final (sin saltos de diseño al cambiar).
- Si la carga falla, se reemplaza por el mensaje de error que ya existe. Que el esqueleto nunca se quede para siempre.
- No dejes un esqueleto genérico donde la forma no se conoce: ahí deja el texto corto actual.
Revisa en el entorno de pruebas en tema claro y oscuro y a 375 px de ancho. Ajusta las pruebas e2e que buscaban el texto «Cargando».
Haz commit: "Verificación fase 7: pantallas esqueleto en lugar de textos de carga".
```

### Prompt 8 · Pruebas y documentación

```text
Lee tests/README.md, tests/conftest.py, tests/ayuda.py, tests/seguridad/test_autenticacion.py, tests/e2e/test_cuenta.py
y tests/herramientas/preparar.php.

- preparar.php: al reiniciar, vacía codigos_verificacion y storage-pruebas/buzon.jsonl; agrega un usuario con teléfono.
- ayuda.py: ultimo_codigo(destino) que lee el buzón simulado.
- tests/seguridad/test_codigos.py: caduca a los 10 min (manipula expira en la BD de pruebas), un solo uso, 5 intentos
  lo invalidan, la espera de reenvío, límites de SMS, la recuperación responde igual con un correo que no existe,
  la recuperación sube sesion_version, admin no puede elegir correo/SMS, requiereVerificado bloquea la subida de una cuenta nueva
  sin verificar pero no la de una cuenta vieja, teléfono inválido → 422, el código nunca aparece en logs ni respuestas.
- tests/e2e: registro con teléfono → código del buzón → OTP verde; código malo → clase otp--error y casillas vacías;
  pegar el código completo; login con segundo paso por correo; recuperar contraseña; los esqueletos desaparecen al cargar.
- Documenta en README.md (Seguridad y tabla de comandos), docs/autorizacion.md y docs/operacion.md (cómo configurar SMTP
  y Twilio, costo de SMS y cómo revisar envíos fallidos).
Corre make pruebas completo y muéstrame el resultado. Haz commit: "Verificación fase 8: pruebas y documentación".
```

### Prompt 9 · Puesta en producción

```text
Ya están las fases 1 a 8. Ayúdame a poner esto en producción, paso a paso, sin saltarte las confirmaciones:
1. Confirma que la migración 006 está aplicada en producción (DESCRIBE usuarios y codigos_verificacion por el túnel).
   Si falta algo, primero pídeme correr "! sudo bin/respaldar.sh" y después aplica bin/migrar.php.
2. Dime qué valores debo poner en config/config.local.php ('mensajes' → smtp de IONOS y twilio), sin pedirme que te los pegue
   en el chat; yo los edito. Revisa que config.local.php siga fuera de git (git check-ignore).
3. Corre bin/probar-mensaje.php correo <mi correo> y sms <mi número> y confirma el resultado.
4. Guíame en una prueba manual en https://localhost/estudio/: crear cuenta con teléfono, verificar por SMS, entrar con
   segundo paso por correo, recuperar contraseña y revisar los esqueletos en cada página.
5. Revisa los logs (tabla logs) de esa prueba y confirma que no aparece ningún código ni teléfono completo.
6. Borra la cuenta de prueba que creamos (muéstramela antes y pide confirmación).
7. Haz commit de lo que falte: "Verificación fase 9: puesta en producción".
```

---

## Riesgos y notas

- **SMS**: cuesta dinero y México exige el remitente registrado en algunos proveedores. Si no quieres pagar, deja solo correo (canal `sms` apagado con `twilio.sid` vacío: el botón no aparece).
- **Correo**: para que no caiga en spam, el remitente debe ser un buzón del dominio de IONOS con SPF/DKIM activos.
- **Producción**: la migración 006 es aditiva y se aplica con respaldo previo. Si algo sale mal, `make restaurar-prueba ARCHIVO=…` permite revisar el respaldo en local antes de restaurarlo en IONOS.
- **Esqueletos**: el comentario más repetido del reel 1 es que se ven falsos si no se parecen al contenido. Por eso el prompt 7 pide la misma forma y la misma medida que el contenido real, y deja el texto donde la forma no se conoce.
