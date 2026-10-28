-- Seguridad (fase 6): un solo intento por examen de curso y alumno, aunque lleguen dos envíos a la vez.
-- Las prácticas personales tienen examen_id NULL y no chocan (NULL no cuenta en un índice único).
SET NAMES utf8mb4;
CREATE UNIQUE INDEX IF NOT EXISTS intento_unico ON intentos_examen (examen_id, usuario_id);
