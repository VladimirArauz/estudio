// Utilidades compartidas por todas las páginas.

// Evita que el texto escrito por una persona se interprete como HTML.
function escapar(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Iconos de trazo lineal 1.5px y esquinas rectas (design.md §10). Nunca emojis.
const ICONOS = {
  flecha: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  volver: '<path d="M20 12H5M11 6l-6 6 6 6"/>',
  subir: '<path d="M12 16V4M6 10l6-6 6 6M4 20h16"/>',
  bajar: '<path d="M12 4v12M6 10l6 6 6-6M4 20h16"/>',
  documento: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  video: '<rect x="3" y="6" width="13" height="12"/><path d="M16 10l5-3v10l-5-3"/>',
  imagen: '<rect x="3" y="4" width="18" height="16"/><path d="M3 16l5-5 4 4 3-3 6 6"/><path d="M15 8h1"/>',
  audio: '<path d="M9 18V5l11-2v13"/><rect x="4" y="15" width="5" height="5"/><rect x="15" y="13" width="5" height="5"/>',
  paquete: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  presentacion: '<rect x="3" y="4" width="18" height="12"/><path d="M12 16v4M8 20h8"/>',
  hoja: '<rect x="4" y="3" width="16" height="18"/><path d="M4 9h16M4 15h16M10 3v18"/>',
  texto: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  cerrar: '<path d="M6 6l12 12M18 6L6 18"/>',
  borrar: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  usuario: '<rect x="8" y="3" width="8" height="8"/><path d="M4 21v-4h16v4"/>',
  entrar: '<path d="M14 4h6v16h-6M3 12h12M11 8l4 4-4 4"/>',
  salir: '<path d="M10 4H4v16h6M9 12h12M17 8l4 4-4 4"/>',
  panel: '<rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="5"/><rect x="13" y="10" width="8" height="11"/><rect x="3" y="13" width="8" height="8"/>',
  curso: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5l6 3 6-3v-5M22 9v6"/>',
  estrella: '<path d="M12 3l2.7 5.6 6.1.8-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.8z"/>',
  ok: '<path d="M4 12l5 5L20 6"/>',
  externo: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  buscar: '<rect x="4" y="4" width="12" height="12"/><path d="M16 16l5 5"/>',
  reloj: '<rect x="3" y="3" width="18" height="18"/><path d="M12 7v5l3 3"/>',
  rayo: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  recargar: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>'
};
function icono(nombre, clase = "") {
  return `<svg class="icono ${clase}" viewBox="0 0 24 24" aria-hidden="true">${ICONOS[nombre] || ""}</svg>`;
}

// Imagen de cada materia: bloque de plano con su símbolo. Solo usa tokens.
function imagenMateria(materia) {
  return `<span class="pieza__simbolo" aria-hidden="true">${escapar(materia.simbolo || materia.nombre.slice(0, 3))}</span>`;
}

// Calificación de 1 a 5 como estrellas.
function estrellas(valor) {
  const n = Math.round(Number(valor) || 0);
  return `<span class="estrellas" aria-label="${n} de 5 estrellas">${[1, 2, 3, 4, 5].map(i =>
    `<svg class="icono icono--16 ${i <= n ? "estrella-llena" : ""}" viewBox="0 0 24 24" aria-hidden="true">${ICONOS.estrella}</svg>`).join("")}</span>`;
}

// Códigos de pieza: EST-001, APO-014…
function codigo(prefijo, n) {
  return `${prefijo}-${String(n).padStart(3, "0")}`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
// Formato de fecha de la voz del sitio: «14 nov 2026», con hora «13:00 h».
function fecha(valor, conHora = false) {
  if (!valor) return "—";
  // Sin hora, «2026-10-26» se leería como medianoche UTC (el día anterior en México): se fuerza hora local.
  const texto0 = String(valor);
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(texto0) ? texto0 + "T00:00" : texto0.replace(" ", "T"));
  if (isNaN(d)) return String(valor);
  let texto = `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
  if (conHora) texto += ` · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} h`;
  return texto;
}

function tamano(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function duracion(segundos) {
  const s = Math.round(Number(segundos) || 0);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${s % 60} s`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

function parametro(nombre) {
  return new URLSearchParams(location.search).get(nombre);
}

// Aviso breve abajo de la pantalla.
function avisar(mensaje, tipo = "ok") {
  let caja = document.querySelector(".aviso-flotante");
  if (!caja) {
    caja = document.createElement("div");
    caja.className = "aviso-flotante";
    caja.setAttribute("role", "status");
    document.body.append(caja);
  }
  caja.classList.toggle("aviso-flotante--error", tipo === "error");
  caja.textContent = mensaje;
  caja.dataset.visible = "true";
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => caja.dataset.visible = "false", 4000);
}

// Tipos de archivo: rótulo, icono y nombre de pestaña.
const TIPOS_ARCHIVO = {
  pdf: { nombre: "PDF", icono: "documento", grupo: "documentos" },
  documento: { nombre: "Documento", icono: "documento", grupo: "documentos" },
  presentacion: { nombre: "Presentación", icono: "presentacion", grupo: "documentos" },
  hoja: { nombre: "Hoja de cálculo", icono: "hoja", grupo: "documentos" },
  texto: { nombre: "Texto", icono: "texto", grupo: "documentos" },
  video: { nombre: "Video", icono: "video", grupo: "videos" },
  audio: { nombre: "Audio", icono: "audio", grupo: "audios" },
  imagen: { nombre: "Imagen", icono: "imagen", grupo: "imagenes" },
  otro: { nombre: "Archivo", icono: "paquete", grupo: "otros" }
};

const ESTADOS_ARCHIVO = {
  pendiente: { texto: "En cola", clase: "chip--aviso" },
  procesando: { texto: "Procesando", clase: "chip--aviso" },
  listo: { texto: "Listo", clase: "chip--ok" },
  error: { texto: "Error", clase: "chip--error" }
};
