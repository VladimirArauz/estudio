-- Sin SMS: los códigos solo se mandan por correo, así que el teléfono ya no se guarda.
-- Idempotente: en una BD nueva (006 ya no crea estas columnas) no cambia nada.
SET NAMES utf8mb4;

-- Quien tenía el segundo paso por SMS lo recibe ahora en su correo.
ALTER TABLE usuarios MODIFY COLUMN segundo_factor ENUM('correo','sms') NULL;
UPDATE usuarios SET segundo_factor = 'correo' WHERE segundo_factor = 'sms';
ALTER TABLE usuarios MODIFY COLUMN segundo_factor ENUM('correo') NULL;

ALTER TABLE usuarios DROP INDEX IF EXISTS usuarios_telefono;
ALTER TABLE usuarios DROP COLUMN IF EXISTS telefono;
ALTER TABLE usuarios DROP COLUMN IF EXISTS telefono_verificado;

-- Los códigos que se mandaron a un teléfono ya no sirven.
DELETE FROM codigos_verificacion WHERE destino NOT LIKE '%@%';
ALTER TABLE codigos_verificacion DROP COLUMN IF EXISTS canal;
ALTER TABLE codigos_verificacion MODIFY COLUMN proposito ENUM('verificar_correo','verificar_telefono','login','recuperar') NOT NULL;
DELETE FROM codigos_verificacion WHERE proposito = 'verificar_telefono';
ALTER TABLE codigos_verificacion MODIFY COLUMN proposito ENUM('verificar_correo','login','recuperar') NOT NULL;
