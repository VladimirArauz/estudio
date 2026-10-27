// Lista de materias que usan index.html y materia.html.
// Para agregar otra materia, copia uno de los bloques y cambia los datos.
const materias = [
  {
    id: "matematicas",
    nombre: "Matemáticas",
    simbolo: "∑ 123",
    color: "#e67e22",
    apuntes: 100,
    asesores: [
      "Asesor 1 – Álgebra",
      "Asesor 2 – Geometría",
      "Asesor 3 – Aritmética",
      "Asesor 4 – Trigonometría",
      "Asesor 5 – Cálculo"
    ],
    material: {
      documentos: ["Guía de fracciones.pdf", "Formulario de álgebra.pdf", "Ejercicios de ecuaciones.docx"],
      videos: ["Cómo resolver ecuaciones de primer grado", "Teorema de Pitágoras explicado"],
      imagenes: ["Tabla de multiplicar", "Figuras geométricas"],
      audios: ["Repaso de tablas de multiplicar"],
      otros: ["Calculadora en línea", "Juego de números"]
    }
  },
  {
    id: "ingles",
    nombre: "Inglés",
    simbolo: "ABC",
    color: "#27ae60",
    apuntes: 100,
    asesores: [
      "Asesor 1 – Gramática",
      "Asesor 2 – Vocabulario",
      "Asesor 3 – Pronunciación",
      "Asesor 4 – Lectura",
      "Asesor 5 – Conversación"
    ],
    material: {
      documentos: ["Verbos irregulares.pdf", "Tiempos verbales.pdf", "Lista de vocabulario.docx"],
      videos: ["Presente simple en 10 minutos", "Frases para presentarte"],
      imagenes: ["Los colores en inglés", "Partes de la casa"],
      audios: ["Pronunciación del alfabeto", "Diálogo en el restaurante"],
      otros: ["Diccionario en línea", "Juego de palabras"]
    }
  }
];

// Imagen de cada materia, compartida por las dos páginas.
function imagenMateria(materia) {
  return `
    <svg viewBox="0 0 220 130" preserveAspectRatio="xMidYMid slice">
      <rect width="220" height="130" fill="${materia.color}"/>
      <circle cx="185" cy="25" r="40" fill="rgba(255,255,255,0.15)"/>
      <circle cx="30" cy="115" r="35" fill="rgba(255,255,255,0.15)"/>
      <text x="110" y="78" text-anchor="middle" font-size="40" font-weight="bold"
            fill="#fff" font-family="Segoe UI, Arial">${materia.simbolo}</text>
    </svg>`;
}
