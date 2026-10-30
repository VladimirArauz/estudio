-- Verificación (fase 1): verificación del correo, segundo paso por correo y códigos de un solo uso.
-- Solo agrega: el código anterior ignora estas columnas. (El teléfono y el SMS se quitaron en 007.)
SET NAMES utf8mb4;

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email_verificado DATETIME NULL;
-- Las cuentas que ya existían quedan en 0 (no se bloquean); las nuevas entran con 1 hasta verificar su correo.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS requiere_verificar TINYINT(1) NOT NULL DEFAULT 0;
-- Segundo paso por código enviado (NULL = ninguno). El TOTP se sigue leyendo de totp_activo.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS segundo_factor ENUM('correo') NULL;

-- Códigos de 6 dígitos: se guarda solo su HMAC con app_key; caducan, se usan una vez y tienen intentos contados.
CREATE TABLE IF NOT EXISTS codigos_verificacion (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED NOT NULL,
  proposito   ENUM('verificar_correo','login','recuperar') NOT NULL,
  destino     VARCHAR(190) NOT NULL,
  codigo_hash CHAR(64) NOT NULL,
  intentos    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expira      DATETIME NOT NULL,
  usado       DATETIME NULL,
  ip          VARCHAR(45) NOT NULL,
  creado      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (usuario_id, proposito, creado),
  INDEX (expira),
  CONSTRAINT codigos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
