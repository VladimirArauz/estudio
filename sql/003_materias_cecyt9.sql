-- Materias del CECyT 9 según los mapas curriculares oficiales de la DEMS (ipn.mx/oferta-educativa):
-- Técnico en Programación (plan 2022), Técnico en Mecatrónica (plan 2020), Técnico en Sistemas Digitales (plan 2021)
-- y Técnico en Desarrollo de Software (a distancia, plan 2008).
-- Las seriadas (Física I–IV, Inglés I–VI…) van juntas en una sola materia; las que se repiten entre carreras, una vez.
-- Además: guías para el examen de admisión al nivel superior (sección «guia», solo admin).
SET NAMES utf8mb4;

ALTER TABLE materias ADD COLUMN IF NOT EXISTS area VARCHAR(60) NOT NULL DEFAULT 'Tronco común' AFTER descripcion;

ALTER TABLE archivos MODIFY seccion ENUM('apuntes','tareas','examenes','apoyo','curso','entrega','guia') NOT NULL;
ALTER TABLE archivos ADD COLUMN IF NOT EXISTS area_examen VARCHAR(40) NULL AFTER actividad_id;

UPDATE materias SET descripcion = 'Álgebra, Geometría y Trigonometría, Geometría Analítica, Cálculo Diferencial, Cálculo Integral y Probabilidad y Estadística (1.º a 6.º nivel).', orden = 1
  WHERE slug = 'matematicas';
UPDATE materias SET descripcion = 'Inglés I a VI (1.º a 6.º nivel): gramática, vocabulario, lectura y conversación.', orden = 4
  WHERE slug = 'ingles';

INSERT IGNORE INTO materias (slug, nombre, simbolo, color, area, descripcion, orden) VALUES
  -- Tronco común (área institucional y científica, humanística y tecnológica básica)
  ('fisica', 'Física', 'F = ma', '#e67e22', 'Tronco común', 'Física I a IV (3.º a 6.º nivel).', 2),
  ('quimica', 'Química', 'H₂O', '#e67e22', 'Tronco común', 'Química I a IV (3.º a 6.º nivel).', 3),
  ('biologia-basica', 'Biología Básica', 'ADN', '#e67e22', 'Tronco común', '2.º nivel.', 5),
  ('expresion-oral-y-escrita', 'Expresión Oral y Escrita', 'Aa', '#e67e22', 'Tronco común', 'Expresión Oral y Escrita I y II (1.º y 2.º nivel).', 6),
  ('comunicacion-cientifica', 'Comunicación Científica', '¶', '#e67e22', 'Tronco común', '3.º nivel.', 7),
  ('filosofia', 'Filosofía', 'φ', '#e67e22', 'Tronco común', 'Filosofía I y II (1.º y 2.º nivel).', 8),
  ('historia-de-mexico-contemporaneo', 'Historia de México Contemporáneo', 'MX', '#e67e22', 'Tronco común', 'Historia de México Contemporáneo I y II (1.º y 2.º nivel).', 9),
  ('entorno-socioeconomico-de-mexico', 'Entorno Socioeconómico de México', '$ MX', '#e67e22', 'Tronco común', '3.º nivel.', 10),
  ('computacion-basica', 'Computación Básica', '</>', '#e67e22', 'Tronco común', 'Computación Básica I y II (1.º y 2.º nivel).', 11),
  ('dibujo-tecnico', 'Dibujo Técnico', '⊿', '#e67e22', 'Tronco común', 'Dibujo Técnico I y II (3.º y 4.º nivel).', 12),
  ('desarrollo-de-habilidades-del-pensamiento', 'Desarrollo de Habilidades del Pensamiento', '?!', '#e67e22', 'Tronco común', '1.º nivel.', 13),
  ('desarrollo-personal', 'Desarrollo Personal', 'YO', '#e67e22', 'Tronco común', '1.º nivel.', 14),
  ('orientacion-juvenil-y-profesional', 'Orientación Juvenil y Profesional', '→', '#e67e22', 'Tronco común', 'Orientación Juvenil y Profesional I a IV (1.º, 2.º, 5.º y 6.º nivel).', 15),
  ('comunicacion-y-liderazgo', 'Comunicación y Liderazgo', 'LID', '#e67e22', 'Tronco común', 'Optativa 1 (2.º nivel).', 16),
  ('apreciacion-artistica', 'Apreciación Artística', 'ART', '#e67e22', 'Tronco común', 'Optativa 1 (2.º nivel).', 17),
  ('tecnicas-de-investigacion-de-campo', 'Técnicas de Investigación de Campo', 'INV', '#e67e22', 'Tronco común', 'Optativa 1 (2.º nivel).', 18),

  -- Técnico en Programación (plan 2022)
  ('algoritmia', 'Algoritmia', 'f(x)', '#2f6fe4', 'Técnico en Programación', '3.º nivel.', 101),
  ('programacion-basica', 'Programación Básica', '{ }', '#2f6fe4', 'Técnico en Programación', '3.º nivel.', 102),
  ('programacion-intermedia', 'Programación Intermedia', '{{ }}', '#2f6fe4', 'Técnico en Programación', '4.º nivel.', 103),
  ('laboratorio-de-desarrollo-de-software', 'Laboratorio de Desarrollo de Software', 'LAB', '#2f6fe4', 'Técnico en Programación', 'Laboratorio de Desarrollo de Software I a IV (3.º a 6.º nivel).', 104),
  ('base-de-datos', 'Base de Datos', 'SQL', '#2f6fe4', 'Técnico en Programación', '4.º nivel. En Desarrollo de Software se llama «Bases de Datos» (4.º nivel).', 105),
  ('aplicaciones-moviles', 'Aplicaciones Móviles', 'APP', '#2f6fe4', 'Técnico en Programación', '5.º nivel.', 106),
  ('programacion-web', 'Programación Web', 'WWW', '#2f6fe4', 'Técnico en Programación', '5.º nivel.', 107),
  ('introduccion-a-los-sistemas-distribuidos', 'Introducción a los Sistemas Distribuidos', 'NET', '#2f6fe4', 'Técnico en Programación', '5.º nivel. También en Desarrollo de Software.', 108),
  ('ciberseguridad', 'Ciberseguridad', 'CYB', '#2f6fe4', 'Técnico en Programación', '6.º nivel.', 109),
  ('introduccion-al-analisis-de-datos', 'Introducción al Análisis de Datos', 'DATA', '#2f6fe4', 'Técnico en Programación', '6.º nivel.', 110),
  ('fundamentos-de-inteligencia-artificial', 'Fundamentos de Inteligencia Artificial', 'IA', '#2f6fe4', 'Técnico en Programación', '6.º nivel.', 111),
  ('programacion-con-nuevas-tecnologias', 'Programación con Nuevas Tecnologías', 'NEW', '#2f6fe4', 'Técnico en Programación', 'Optativa 2 (4.º nivel).', 112),
  ('emprendimiento-tecnologico', 'Emprendimiento Tecnológico', 'EMP', '#2f6fe4', 'Técnico en Programación', 'Optativa 2 (4.º nivel).', 113),
  ('pruebas-de-software', 'Pruebas de Software', 'QA', '#2f6fe4', 'Técnico en Programación', 'Optativa 3 (5.º nivel).', 114),
  ('gestion-de-las-ti-en-la-organizacion', 'Gestión de las TI en la Organización', 'TI', '#2f6fe4', 'Técnico en Programación', 'Optativa 3 (5.º nivel).', 115),
  ('proyecto-integrador', 'Proyecto Integrador', 'PI', '#2f6fe4', 'Técnico en Programación', 'Optativa 4, opción curricular de titulación (6.º nivel). También en Desarrollo de Software.', 116),
  ('direccion-de-proyectos', 'Dirección de Proyectos', 'DP', '#2f6fe4', 'Técnico en Programación', 'Optativa 4, opción curricular de titulación (6.º nivel).', 117),

  -- Técnico en Mecatrónica (plan 2020)
  ('metrologia-y-tecnologia-de-materiales', 'Metrología y Tecnología de Materiales', 'mm', '#8e44ad', 'Técnico en Mecatrónica', '3.º nivel.', 201),
  ('electrotecnia-de-corriente-continua-y-corriente-alterna', 'Electrotecnia de Corriente Continua y Corriente Alterna', 'CC/CA', '#8e44ad', 'Técnico en Mecatrónica', '3.º nivel.', 202),
  ('mecanizado-de-piezas-para-sistemas-mecatronicos', 'Mecanizado de Piezas para Sistemas Mecatrónicos', 'CNC', '#8e44ad', 'Técnico en Mecatrónica', '4.º nivel.', 203),
  ('introduccion-a-sistemas-digitales', 'Introducción a Sistemas Digitales', '0101', '#8e44ad', 'Técnico en Mecatrónica', '4.º nivel.', 204),
  ('diseno-de-mecanismos-asistidos-por-computadora', 'Diseño de Mecanismos Asistidos por Computadora', '⚙', '#8e44ad', 'Técnico en Mecatrónica', '5.º nivel.', 205),
  ('sensores-y-actuadores-electronicos', 'Sensores y Actuadores Electrónicos', 'S/A', '#8e44ad', 'Técnico en Mecatrónica', '5.º nivel.', 206),
  ('dispositivos-logicos-programables', 'Dispositivos Lógicos Programables', 'PLD', '#8e44ad', 'Técnico en Mecatrónica', '5.º nivel.', 207),
  ('electroneumatica', 'Electroneumática', 'PSI', '#8e44ad', 'Técnico en Mecatrónica', '6.º nivel.', 208),
  ('electronica-de-potencia', 'Electrónica de Potencia', 'kW', '#8e44ad', 'Técnico en Mecatrónica', '6.º nivel.', 209),
  ('herramientas-computacionales-de-vanguardia', 'Herramientas Computacionales de Vanguardia (CAD, CAM)', 'CAD', '#8e44ad', 'Técnico en Mecatrónica', '6.º nivel.', 210),
  ('procesos-de-soldadura-en-sistemas-mecatronicos', 'Procesos de Soldadura en Sistemas Mecatrónicos', 'SOLD', '#8e44ad', 'Técnico en Mecatrónica', 'Optativa 2 (3.º nivel).', 211),
  ('gestion-de-la-calidad-en-sistemas-mecatronicos', 'Gestión de la Calidad en Sistemas Mecatrónicos', 'ISO', '#8e44ad', 'Técnico en Mecatrónica', 'Optativa 2 (3.º nivel).', 212),
  ('manufactura-avanzada', 'Manufactura Avanzada', 'MFG', '#8e44ad', 'Técnico en Mecatrónica', 'Optativa 3 (4.º nivel).', 213),
  ('simulacion-de-sistemas-electronicos', 'Simulación de Sistemas Electrónicos', 'SIM', '#8e44ad', 'Técnico en Mecatrónica', 'Optativa 3 (4.º nivel).', 214),
  ('robotica-industrial', 'Robótica Industrial', 'BOT', '#8e44ad', 'Técnico en Mecatrónica', 'Optativa 4 (5.º nivel).', 215),
  ('diseno-de-aplicaciones-moviles', 'Diseño de Aplicaciones Móviles', 'UX', '#8e44ad', 'Técnico en Mecatrónica', 'Optativa 4 (5.º nivel).', 216),
  ('integracion-de-sistemas', 'Integración de Sistemas', 'INT', '#8e44ad', 'Técnico en Mecatrónica', 'Optativa 5, opción curricular de titulación (6.º nivel).', 217),
  ('desarrollo-de-proyectos-mecatronicos', 'Desarrollo de Proyectos Mecatrónicos', 'PROY', '#8e44ad', 'Técnico en Mecatrónica', 'Optativa 5, opción curricular de titulación (6.º nivel).', 218),

  -- Técnico en Sistemas Digitales (plan 2021)
  ('circuitos-logicos-combinatorios', 'Circuitos Lógicos Combinatorios', 'AND', '#16a085', 'Técnico en Sistemas Digitales', '3.º nivel.', 301),
  ('circuitos-electronicos', 'Circuitos Electrónicos', 'Ω', '#16a085', 'Técnico en Sistemas Digitales', '3.º nivel.', 302),
  ('instrumentacion-electronica', 'Instrumentación Electrónica', 'V·A', '#16a085', 'Técnico en Sistemas Digitales', '3.º nivel.', 303),
  ('circuitos-logicos-secuenciales', 'Circuitos Lógicos Secuenciales', 'FF', '#16a085', 'Técnico en Sistemas Digitales', '4.º nivel.', 304),
  ('elementos-electronicos', 'Elementos Electrónicos', 'R C L', '#16a085', 'Técnico en Sistemas Digitales', '4.º nivel.', 305),
  ('lenguaje-de-programacion', 'Lenguaje de Programación', 'C', '#16a085', 'Técnico en Sistemas Digitales', '4.º nivel. También en Mecatrónica.', 306),
  ('arquitectura-de-microcontroladores', 'Arquitectura de Microcontroladores', 'MCU', '#16a085', 'Técnico en Sistemas Digitales', '5.º nivel.', 307),
  ('dispositivos-electronicos', 'Dispositivos Electrónicos', 'BJT', '#16a085', 'Técnico en Sistemas Digitales', '5.º nivel.', 308),
  ('electronica-analogica-y-digital', 'Electrónica Analógica y Digital', 'A/D', '#16a085', 'Técnico en Sistemas Digitales', '5.º nivel.', 309),
  ('aplicaciones-con-microcontroladores', 'Aplicaciones con Microcontroladores', 'µC', '#16a085', 'Técnico en Sistemas Digitales', '6.º nivel.', 310),
  ('mantenimiento-de-equipo-electronico', 'Mantenimiento de Equipo Electrónico', 'FIX', '#16a085', 'Técnico en Sistemas Digitales', '6.º nivel.', 311),
  ('redes-digitales', 'Redes Digitales', 'LAN', '#16a085', 'Técnico en Sistemas Digitales', '6.º nivel.', 312),
  ('software-de-diseno-electronico', 'Software de Diseño Electrónico', 'PCB', '#16a085', 'Técnico en Sistemas Digitales', 'Optativa 2 (4.º nivel).', 313),
  ('aplicaciones-de-dispositivos-moviles', 'Aplicaciones de Dispositivos Móviles', 'MOV', '#16a085', 'Técnico en Sistemas Digitales', 'Optativa 2 (4.º nivel).', 314),
  ('acondicionamiento-de-sistemas', 'Acondicionamiento de Sistemas', 'ACS', '#16a085', 'Técnico en Sistemas Digitales', 'Optativa 3 (5.º nivel).', 315),
  ('programacion-orientada-a-objetos', 'Programación Orientada a Objetos', 'POO', '#16a085', 'Técnico en Sistemas Digitales', 'Optativa 3 (5.º nivel). En Desarrollo de Software es obligatoria (3.º nivel).', 316),
  ('sistemas-de-control-y-automatizacion', 'Sistemas de Control y Automatización', 'PID', '#16a085', 'Técnico en Sistemas Digitales', 'Optativa 4, opción curricular de titulación (6.º nivel).', 317),
  ('internet-de-las-cosas', 'Internet de las Cosas', 'IoT', '#16a085', 'Técnico en Sistemas Digitales', 'Optativa 4, opción curricular de titulación (6.º nivel).', 318),

  -- Técnico en Desarrollo de Software (modalidad a distancia, plan 2008)
  ('laboratorio-de-proyectos-de-tecnologias-de-la-informacion', 'Laboratorio de Proyectos de Tecnologías de la Información', 'LAB TI', '#c0392b', 'Técnico en Desarrollo de Software', 'Laboratorio I a IV (3.º a 6.º nivel).', 401),
  ('administracion-de-proyectos-de-tecnologias-de-la-informacion', 'Administración de Proyectos de Tecnologías de la Información', 'APTI', '#c0392b', 'Técnico en Desarrollo de Software', 'I (3.º nivel) y II (optativa 2, 4.º nivel).', 402),
  ('programacion-y-servicios-web', 'Programación y Servicios Web', 'API', '#c0392b', 'Técnico en Desarrollo de Software', '4.º nivel.', 403),
  ('introduccion-a-la-ingenieria-de-pruebas', 'Introducción a la Ingeniería de Pruebas', 'TEST', '#c0392b', 'Técnico en Desarrollo de Software', '5.º nivel.', 404),
  ('seguridad-web-y-aplicaciones', 'Seguridad Web y Aplicaciones', 'SEC', '#c0392b', 'Técnico en Desarrollo de Software', '5.º nivel.', 405),
  ('metodos-agiles-de-programacion', 'Métodos Ágiles de Programación', 'AGIL', '#c0392b', 'Técnico en Desarrollo de Software', '6.º nivel.', 406),
  ('soporte-de-software', 'Soporte de Software', 'SOP', '#c0392b', 'Técnico en Desarrollo de Software', '6.º nivel.', 407),
  ('ingenieria-de-software-basica', 'Ingeniería de Software Básica', 'ISW', '#c0392b', 'Técnico en Desarrollo de Software', '6.º nivel.', 408),
  ('tecnicas-de-programacion-personal-con-calidad', 'Técnicas de Programación Personal con Calidad', 'PSP', '#c0392b', 'Técnico en Desarrollo de Software', 'Optativa 2 (4.º nivel).', 409),
  ('automatizacion-de-pruebas', 'Automatización de Pruebas', 'AUTO', '#c0392b', 'Técnico en Desarrollo de Software', 'Optativa 3 (5.º nivel).', 410),
  ('desarrollo-humano-y-personal', 'Desarrollo Humano y Personal', 'DHP', '#c0392b', 'Técnico en Desarrollo de Software', 'Optativa 3 (5.º nivel).', 411),
  ('plan-de-negocios', 'Plan de Negocios', 'PLAN', '#c0392b', 'Técnico en Desarrollo de Software', 'Optativa 4 (6.º nivel).', 412);
