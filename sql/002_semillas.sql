-- Materias de ejemplo (las que antes vivían en materias.js).
SET NAMES utf8mb4;

INSERT IGNORE INTO materias (slug, nombre, simbolo, color, descripcion, orden) VALUES
  ('matematicas', 'Matemáticas', '∑ 123', '#e67e22', 'Álgebra, geometría, trigonometría y cálculo.', 1),
  ('ingles', 'Inglés', 'ABC', '#27ae60', 'Gramática, vocabulario, lectura y conversación.', 2);

INSERT INTO asesores (materia_id, nombre)
SELECT m.id, a.nombre FROM materias m
JOIN (
  SELECT 'matematicas' slug, 'Asesor 1 – Álgebra' nombre UNION ALL
  SELECT 'matematicas', 'Asesor 2 – Geometría' UNION ALL
  SELECT 'matematicas', 'Asesor 3 – Aritmética' UNION ALL
  SELECT 'matematicas', 'Asesor 4 – Trigonometría' UNION ALL
  SELECT 'matematicas', 'Asesor 5 – Cálculo' UNION ALL
  SELECT 'ingles', 'Asesor 1 – Gramática' UNION ALL
  SELECT 'ingles', 'Asesor 2 – Vocabulario' UNION ALL
  SELECT 'ingles', 'Asesor 3 – Pronunciación' UNION ALL
  SELECT 'ingles', 'Asesor 4 – Lectura' UNION ALL
  SELECT 'ingles', 'Asesor 5 – Conversación'
) a ON a.slug = m.slug
WHERE NOT EXISTS (SELECT 1 FROM asesores x WHERE x.materia_id = m.id);
