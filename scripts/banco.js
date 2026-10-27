// Banco local de preguntas: se usa cuando la IA no está disponible (sin API key, sin cuota o sin internet).
// Formato igual al que devuelve api/ia.php.
const BANCO = {
  "Matemáticas": [
    { pregunta: "¿Cuál es el valor de x en 3x + 6 = 0?", opciones: ["x = 2", "x = -2", "x = 6", "x = -6"], correcta: 1, explicacion: "Restas 6 en ambos lados: 3x = -6; divides entre 3: x = -2.", tema: "Ecuaciones lineales" },
    { pregunta: "¿Cuánto vale (x + 3)^2 desarrollado?", opciones: ["x^2 + 9", "x^2 + 3x + 9", "x^2 + 6x + 9", "x^2 + 6x + 6"], correcta: 2, explicacion: "Binomio al cuadrado: x^2 + 2(3)(x) + 3^2 = x^2 + 6x + 9.", tema: "Productos notables" },
    { pregunta: "En un triángulo rectángulo los catetos miden 6 y 8. ¿Cuánto mide la hipotenusa?", opciones: ["10", "12", "14", "48"], correcta: 0, explicacion: "Por Pitágoras: sqrt(6^2 + 8^2) = sqrt(100) = 10.", tema: "Teorema de Pitágoras" },
    { pregunta: "¿Cuál es la derivada de f(x) = 5x^3?", opciones: ["5x^2", "15x^2", "15x^3", "x^4"], correcta: 1, explicacion: "Regla de la potencia: 3 · 5 x^(3-1) = 15x^2.", tema: "Derivadas" },
    { pregunta: "¿Cuál es la pendiente de la recta que pasa por (1, 2) y (3, 8)?", opciones: ["2", "3", "4", "6"], correcta: 1, explicacion: "m = (8 - 2) / (3 - 1) = 6 / 2 = 3.", tema: "Geometría analítica" },
    { pregunta: "sen(30°) es igual a:", opciones: ["1/2", "sqrt(3)/2", "1", "sqrt(2)/2"], correcta: 0, explicacion: "Es un valor del triángulo notable 30-60-90: sen 30° = 1/2.", tema: "Trigonometría" }
  ],
  "Física": [
    { pregunta: "Un auto recorre 120 km en 2 h a velocidad constante. ¿Cuál es su velocidad?", opciones: ["30 km/h", "60 km/h", "120 km/h", "240 km/h"], correcta: 1, explicacion: "v = d / t = 120 km / 2 h = 60 km/h.", tema: "Cinemática" },
    { pregunta: "Según la segunda ley de Newton, la fuerza es igual a:", opciones: ["m / a", "m · v", "m · a", "a / m"], correcta: 2, explicacion: "F = m · a: la fuerza neta es la masa por la aceleración.", tema: "Leyes de Newton" },
    { pregunta: "¿Cuál es la unidad de la energía en el Sistema Internacional?", opciones: ["Watt", "Newton", "Joule", "Pascal"], correcta: 2, explicacion: "La energía y el trabajo se miden en joules (J = N · m).", tema: "Trabajo y energía" },
    { pregunta: "Por una resistencia de 10 Ω circula una corriente de 2 A. ¿Qué voltaje tiene?", opciones: ["5 V", "12 V", "20 V", "0.2 V"], correcta: 2, explicacion: "Ley de Ohm: V = I · R = 2 A · 10 Ω = 20 V.", tema: "Electricidad" },
    { pregunta: "Un objeto en caída libre parte del reposo. ¿Qué velocidad tiene tras 2 s? (g = 9.8 m/s^2)", opciones: ["4.9 m/s", "9.8 m/s", "19.6 m/s", "39.2 m/s"], correcta: 2, explicacion: "v = g · t = 9.8 · 2 = 19.6 m/s.", tema: "Caída libre" }
  ],
  "Química": [
    { pregunta: "¿Cuál es el número atómico del carbono?", opciones: ["4", "6", "12", "14"], correcta: 1, explicacion: "El carbono tiene 6 protones; su masa atómica aproximada es 12.", tema: "Tabla periódica" },
    { pregunta: "¿Qué tipo de enlace se forma entre Na y Cl en el NaCl?", opciones: ["Covalente polar", "Covalente no polar", "Iónico", "Metálico"], correcta: 2, explicacion: "Un metal cede un electrón a un no metal: se forma un enlace iónico.", tema: "Enlaces químicos" },
    { pregunta: "Una disolución con pH 3 es:", opciones: ["Ácida", "Neutra", "Básica", "Salina"], correcta: 0, explicacion: "pH menor a 7 es ácido; 7 es neutro y mayor a 7 es básico.", tema: "Ácidos y bases" },
    { pregunta: "¿Cuántos moles hay en 36 g de agua (H2O, 18 g/mol)?", opciones: ["0.5", "1", "2", "18"], correcta: 2, explicacion: "n = masa / masa molar = 36 g / 18 g/mol = 2 mol.", tema: "Estequiometría" }
  ],
  "Biología": [
    { pregunta: "¿Qué organelo realiza la fotosíntesis?", opciones: ["Mitocondria", "Cloroplasto", "Ribosoma", "Aparato de Golgi"], correcta: 1, explicacion: "Los cloroplastos contienen clorofila y transforman la luz en energía química.", tema: "Célula" },
    { pregunta: "¿Cuál es la base nitrogenada que solo está en el ARN?", opciones: ["Timina", "Adenina", "Uracilo", "Guanina"], correcta: 2, explicacion: "En el ARN el uracilo sustituye a la timina del ADN.", tema: "Genética" },
    { pregunta: "Al cruzar Aa × Aa, ¿qué proporción de la descendencia es aa?", opciones: ["0 %", "25 %", "50 %", "75 %"], correcta: 1, explicacion: "El cuadro de Punnett da AA, Aa, Aa y aa: 1 de 4 es aa (25 %).", tema: "Herencia mendeliana" },
    { pregunta: "¿En qué fase de la mitosis los cromosomas se alinean en el centro de la célula?", opciones: ["Profase", "Metafase", "Anafase", "Telofase"], correcta: 1, explicacion: "En la metafase los cromosomas se ordenan en la placa ecuatorial.", tema: "División celular" }
  ],
  "Historia": [
    { pregunta: "¿En qué año inició la Independencia de México?", opciones: ["1810", "1821", "1857", "1910"], correcta: 0, explicacion: "El 16 de septiembre de 1810 Miguel Hidalgo dio el Grito de Dolores.", tema: "Independencia" },
    { pregunta: "¿Qué presidente fundó el Instituto Politécnico Nacional en 1936?", opciones: ["Plutarco Elías Calles", "Lázaro Cárdenas", "Manuel Ávila Camacho", "Álvaro Obregón"], correcta: 1, explicacion: "El IPN se fundó durante el gobierno de Lázaro Cárdenas, en 1936.", tema: "México posrevolucionario" },
    { pregunta: "¿Qué documento de 1917 sigue rigiendo a México?", opciones: ["Plan de Ayala", "Constitución Política de los Estados Unidos Mexicanos", "Leyes de Reforma", "Plan de Iguala"], correcta: 1, explicacion: "La Constitución promulgada el 5 de febrero de 1917 sigue vigente con reformas.", tema: "Revolución Mexicana" },
    { pregunta: "La Revolución Mexicana comenzó en:", opciones: ["1810", "1867", "1910", "1929"], correcta: 2, explicacion: "Inició el 20 de noviembre de 1910 con el Plan de San Luis de Francisco I. Madero.", tema: "Revolución Mexicana" }
  ],
  "Comunicación": [
    { pregunta: "¿Cuál es un sinónimo de «efímero»?", opciones: ["Eterno", "Pasajero", "Enorme", "Firme"], correcta: 1, explicacion: "Efímero significa que dura poco: pasajero, breve.", tema: "Sinónimos" },
    { pregunta: "¿Qué palabra está bien acentuada?", opciones: ["Examen", "Exámen", "Examén", "Éxamen"], correcta: 0, explicacion: "«Examen» es grave terminada en n: no lleva tilde. Su plural «exámenes» sí la lleva.", tema: "Ortografía" },
    { pregunta: "Completa la analogía. Libro : leer :: cuchillo : …", opciones: ["Cocina", "Filo", "Cortar", "Metal"], correcta: 2, explicacion: "La relación es objeto : función. La función del cuchillo es cortar.", tema: "Analogías" },
    { pregunta: "En «Los alumnos estudian para el examen», ¿cuál es el sujeto?", opciones: ["Estudian", "Para el examen", "Los alumnos", "El examen"], correcta: 2, explicacion: "El sujeto es quien realiza la acción del verbo: los alumnos.", tema: "Gramática" }
  ],
  "Inglés": [
    { pregunta: "Choose the correct past form: «Yesterday I ___ to school.»", opciones: ["go", "goes", "went", "gone"], correcta: 2, explicacion: "«Go» es irregular: go – went – gone. Para el pasado simple se usa «went».", tema: "Pasado simple" },
    { pregunta: "«She ___ lived here since 2020.»", opciones: ["has", "have", "is", "was"], correcta: 0, explicacion: "Presente perfecto con tercera persona singular: has + participio.", tema: "Presente perfecto" },
    { pregunta: "What is the opposite of «expensive»?", opciones: ["Cheap", "Rich", "Large", "Fast"], correcta: 0, explicacion: "Expensive (caro) se opone a cheap (barato).", tema: "Vocabulario" },
    { pregunta: "«If it rains, we ___ at home.»", opciones: ["stay", "will stay", "stayed", "would stayed"], correcta: 1, explicacion: "Primer condicional: if + presente simple, will + verbo.", tema: "Condicionales" }
  ]
};

// Mismo formato que la IA, armado con el banco local.
function generarLocal({ modo, materia, cantidad }) {
  const mezclar = lista => lista.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const fuente = modo === "simulacro" || !BANCO[materia]
    ? Object.entries(BANCO).flatMap(([m, ps]) => ps.map(p => ({ ...p, materia: m })))
    : BANCO[materia].map(p => ({ ...p, materia }));
  const elegidas = mezclar(fuente).slice(0, cantidad);
  if (modo === "flashcards") {
    return { tarjetas: elegidas.map(p => ({ frente: p.pregunta, reverso: `${p.opciones[p.correcta]}. ${p.explicacion}`, tema: p.tema })) };
  }
  if (modo === "ejercicios") {
    return { ejercicios: elegidas.map(p => ({ enunciado: p.pregunta, pasos: [p.explicacion], respuesta: p.opciones[p.correcta], tema: p.tema })) };
  }
  return { preguntas: elegidas };
}
