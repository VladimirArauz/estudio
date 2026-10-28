-- Seguridad (fase 4): versión de sesión, verificación en dos pasos (TOTP) y límites de peticiones.
SET NAMES utf8mb4;

-- Sube al cambiar o restablecer la contraseña y al suspender la cuenta: invalida las demás sesiones.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS sesion_version INT UNSIGNED NOT NULL DEFAULT 1;
-- TOTP (RFC 6238). El secreto va cifrado con app_key (AES-256-GCM); los códigos de recuperación, con hash.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS totp_secreto VARCHAR(255) NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS totp_activo TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS totp_ultimo BIGINT NULL;          -- último paso usado (sin repetición)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS totp_recuperacion TEXT NULL;      -- JSON con password_hash de cada código

CREATE TABLE IF NOT EXISTS limites (
  clave   VARCHAR(190) NOT NULL PRIMARY KEY,
  inicio  DATETIME NOT NULL,
  conteo  INT UNSIGNED NOT NULL DEFAULT 0,
  INDEX (inicio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
