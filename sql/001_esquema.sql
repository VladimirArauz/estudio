-- Esquema de la plataforma «Bátiz hasta la muerte» (MariaDB 11.8).
-- Se puede ejecutar varias veces: solo crea lo que falta.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS usuarios (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre        VARCHAR(120) NOT NULL,
  email         VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rol           ENUM('admin','profesor','alumno') NOT NULL DEFAULT 'alumno',
  estado        ENUM('activo','suspendido') NOT NULL DEFAULT 'activo',
  creado        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_acceso DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Para limitar intentos de inicio de sesión.
CREATE TABLE IF NOT EXISTS intentos_login (
  id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email  VARCHAR(190) NOT NULL,
  ip     VARCHAR(45) NOT NULL,
  exito  TINYINT(1) NOT NULL DEFAULT 0,
  fecha  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (email, fecha), INDEX (ip, fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS logs (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED NULL,
  accion      VARCHAR(60) NOT NULL,
  objeto_tipo VARCHAR(40) NULL,
  objeto_id   INT UNSIGNED NULL,
  detalle     TEXT NULL,
  ip          VARCHAR(45) NULL,
  fecha       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (fecha), INDEX (accion), INDEX (usuario_id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Una fila por página vista; el latido actualiza los segundos.
CREATE TABLE IF NOT EXISTS visitas (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vista_id      CHAR(32) NOT NULL UNIQUE,
  usuario_id    INT UNSIGNED NULL,
  ruta          VARCHAR(255) NOT NULL,
  seccion       VARCHAR(60) NULL,
  inicio        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_latido DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  segundos      INT UNSIGNED NOT NULL DEFAULT 0,
  INDEX (ruta), INDEX (inicio), INDEX (usuario_id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS materias (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug        VARCHAR(60) NOT NULL UNIQUE,
  nombre      VARCHAR(120) NOT NULL,
  simbolo     VARCHAR(12) NOT NULL DEFAULT '',
  color       VARCHAR(7) NOT NULL DEFAULT '#2F6FE4',
  descripcion TEXT NULL,
  orden       INT NOT NULL DEFAULT 0,
  creado      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asesores (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  materia_id INT UNSIGNED NOT NULL,
  nombre     VARCHAR(160) NOT NULL,
  FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS postulaciones_profesor (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id   INT UNSIGNED NOT NULL,
  materia_id   INT UNSIGNED NOT NULL,
  mensaje      TEXT NULL,
  estado       ENUM('pendiente','aprobada','rechazada') NOT NULL DEFAULT 'pendiente',
  revisado_por INT UNSIGNED NULL,
  creado       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revisado     DATETIME NULL,
  UNIQUE (usuario_id, materia_id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE CASCADE,
  FOREIGN KEY (revisado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cursos (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  materia_id  INT UNSIGNED NOT NULL,
  profesor_id INT UNSIGNED NOT NULL,
  titulo      VARCHAR(160) NOT NULL,
  descripcion TEXT NULL,
  estado      ENUM('activo','archivado') NOT NULL DEFAULT 'activo',
  creado      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE CASCADE,
  FOREIGN KEY (profesor_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inscripciones (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  curso_id  INT UNSIGNED NOT NULL,
  alumno_id INT UNSIGNED NOT NULL,
  creado    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (curso_id, alumno_id),
  FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE CASCADE,
  FOREIGN KEY (alumno_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS actividades (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  curso_id     INT UNSIGNED NOT NULL,
  titulo       VARCHAR(160) NOT NULL,
  descripcion  TEXT NULL,
  fecha_limite DATETIME NULL,
  puntos       SMALLINT UNSIGNED NOT NULL DEFAULT 10,
  creado       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Todo lo que se sube. El procesador de Python genera storage/generados/{uuid}/index.html.
CREATE TABLE IF NOT EXISTS archivos (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid            CHAR(32) NOT NULL UNIQUE,
  seccion         ENUM('apuntes','tareas','examenes','apoyo','curso','entrega') NOT NULL,
  materia_id      INT UNSIGNED NULL,
  curso_id        INT UNSIGNED NULL,
  actividad_id    INT UNSIGNED NULL,
  autor_id        INT UNSIGNED NULL,
  titulo          VARCHAR(200) NOT NULL,
  nombre_original VARCHAR(255) NOT NULL,
  extension       VARCHAR(12) NOT NULL DEFAULT '',
  mime            VARCHAR(120) NOT NULL,
  tipo            ENUM('pdf','documento','presentacion','hoja','audio','video','imagen','texto','otro') NOT NULL,
  bytes           BIGINT UNSIGNED NOT NULL DEFAULT 0,
  estado          ENUM('pendiente','procesando','listo','error') NOT NULL DEFAULT 'pendiente',
  error           TEXT NULL,
  resumen         TEXT NULL,
  creado          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  procesado       DATETIME NULL,
  INDEX (seccion, materia_id), INDEX (estado), INDEX (curso_id),
  FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE SET NULL,
  FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE CASCADE,
  FOREIGN KEY (actividad_id) REFERENCES actividades(id) ON DELETE CASCADE,
  FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS entregas (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actividad_id        INT UNSIGNED NOT NULL,
  alumno_id           INT UNSIGNED NOT NULL,
  archivo_id          INT UNSIGNED NULL,
  comentario_alumno   TEXT NULL,
  calificacion        DECIMAL(5,2) NULL,
  comentario_profesor TEXT NULL,
  entregado           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  calificado          DATETIME NULL,
  UNIQUE (actividad_id, alumno_id),
  FOREIGN KEY (actividad_id) REFERENCES actividades(id) ON DELETE CASCADE,
  FOREIGN KEY (alumno_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (archivo_id) REFERENCES archivos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exámenes guardados (de un curso o generados con IA).
CREATE TABLE IF NOT EXISTS examenes (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  curso_id   INT UNSIGNED NULL,
  materia_id INT UNSIGNED NULL,
  autor_id   INT UNSIGNED NULL,
  titulo     VARCHAR(200) NOT NULL,
  origen     ENUM('ia','manual') NOT NULL DEFAULT 'manual',
  modo       VARCHAR(30) NOT NULL DEFAULT 'examen',
  preguntas  LONGTEXT NOT NULL,
  publicado  TINYINT(1) NOT NULL DEFAULT 0,
  creado     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE CASCADE,
  FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE SET NULL,
  FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cada vez que alguien resuelve un examen (de curso o de Preparación).
CREATE TABLE IF NOT EXISTS intentos_examen (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  examen_id    INT UNSIGNED NULL,
  usuario_id   INT UNSIGNED NOT NULL,
  modo         VARCHAR(30) NOT NULL,
  materia      VARCHAR(120) NULL,
  titulo       VARCHAR(200) NOT NULL,
  detalle      LONGTEXT NULL,
  aciertos     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  total        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  puntaje      DECIMAL(5,2) NOT NULL DEFAULT 0,
  duracion_seg INT UNSIGNED NULL,
  creado       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (usuario_id, creado),
  FOREIGN KEY (examen_id) REFERENCES examenes(id) ON DELETE SET NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS evaluaciones_curso (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  curso_id           INT UNSIGNED NOT NULL,
  alumno_id          INT UNSIGNED NOT NULL,
  estrellas_curso    TINYINT UNSIGNED NOT NULL,
  estrellas_profesor TINYINT UNSIGNED NOT NULL,
  comentario         TEXT NULL,
  creado             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (curso_id, alumno_id),
  FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE CASCADE,
  FOREIGN KEY (alumno_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cache_ia (
  clave     CHAR(64) PRIMARY KEY,
  respuesta LONGTEXT NOT NULL,
  expira    DATETIME NOT NULL,
  INDEX (expira)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Conteo diario de llamadas a la IA por usuario o IP (límite de cuota).
CREATE TABLE IF NOT EXISTS uso_ia (
  quien  VARCHAR(64) NOT NULL,
  fecha  DATE NOT NULL,
  conteo INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (quien, fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
