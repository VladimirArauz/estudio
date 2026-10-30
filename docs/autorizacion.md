# Matriz de autorización

Quién puede hacer qué en cada endpoint. **Admin** significa admin *con 2FA activo* (`esAdmin()`); un admin sin
2FA solo conserva los permisos de una cuenta normal. Todo POST exige además el token CSRF (`exigirPost()`).
🔒 = pide confirmar la contraseña (y el 2FA) en los últimos 5 min (`exigirReautenticacion()`).
Las pruebas de `tests/seguridad/test_autorizacion.py` recorren esta tabla.

| Endpoint · acción | Invitado | Alumno | Profesor | Admin |
|---|---|---|---|---|
| `auth` yo / entrar / registrar / verificar_2fa | ✔ | ✔ | ✔ | ✔ |
| `auth` cambiar_password · confirmar · totp_* · salir | — | ✔ | ✔ | ✔ (no puede desactivar su 2FA) |
| `auth` codigo_enviar · codigo_verificar (verificar su correo) | — | ✔ | ✔ | ✔ |
| `materias` GET | ✔ | ✔ | ✔ | ✔ |
| `materias` crear / editar | — | — | — | ✔ |
| `materias` borrar | — | — | — | ✔ 🔒 |
| `archivos` GET (lista y detalle) | públicos | públicos + propios + cursos donde está inscrito | públicos + propios + sus cursos y entregas de sus cursos | todos |
| `archivos` borrar / reprocesar | — | propios | propios + material de sus cursos | todos (ajenos 🔒) |
| `archivo` (servir original, vista, recursos) | públicos | igual que `archivos` GET | igual que `archivos` GET | todos |
| `subir` apuntes / tareas / exámenes / apoyo | — | ✔ (cuota diaria) | ✔ (cuota diaria) | ✔ |
| `subir` curso | — | — | solo en sus cursos | ✔ |
| `subir` entrega | — | inscrito en el curso | — | — |
| `subir` guia | — | — | — | ✔ |
| `ia` estado | ✔ | ✔ | ✔ | ✔ |
| `ia` generar / guardar_intento / desempeno | — | ✔ | ✔ | ✔ |
| `cursos` GET por materia · detalle del curso | ✔ | ✔ | ✔ | ✔ |
| `cursos` actividades · exámenes · examen | — | inscrito | profesor del curso | ✔ |
| `cursos` entregas · alumnos · resultados · estadísticas | — | — | profesor del curso | ✔ |
| `cursos` desempeño | — | inscrito | — | — |
| `cursos` postular | — | — | ✔ | — |
| `cursos` crear | — | — | con postulación aprobada en la materia | ✔ |
| `cursos` editar · quitar_alumno · actividad_* · calificar · examen_guardar/publicar/borrar | — | — | profesor del curso | ✔ |
| `cursos` inscribir · baja · entregar · evaluar | — | ✔ (inscrito para entregar y evaluar) | — | — |
| `cursos` examen_responder | — | inscrito, publicado, una vez | profesor del curso (sin registrar intento) | ✔ |
| `admin` GET (todas las secciones) | — | — | — | ✔ |
| `admin` postulacion · guia_area | — | — | — | ✔ |
| `admin` usuario_rol · usuario_estado · usuario_password | — | — | — | ✔ 🔒 |
| `visita` | ✔ (con token de su sesión) | ✔ | ✔ | ✔ |
| `salud` | ✔ | ✔ | ✔ | ✔ |

Reglas de datos que no dependen solo del rol:
- Las cuentas creadas después de la verificación (`requiere_verificar = 1`) no pueden `subir`, `postular` ni `inscribir`
  hasta verificar su correo (`requiereVerificado()`, responde 403 con `code: VERIFICAR`).
- Un código de verificación vale solo para su cuenta, su propósito y el correo al que se mandó; caduca a los 10 min,
  se usa una vez y acepta 5 intentos.
- Una actividad, entrega o examen se valida siempre contra el curso indicado (un profesor no ve datos de otros cursos).
- Los exámenes de curso se califican en el servidor; el alumno no recibe las respuestas antes de terminar y solo
  cuenta su primer intento (índice único `intento_unico`).
- Cada alumno evalúa un curso una sola vez (índice único).
