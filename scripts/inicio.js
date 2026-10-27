// Página de inicio: láminas Estudio y Apoyo.

let materias = [];
let seccionActual = "apuntes";
const NOMBRES_SECCION = { apuntes: "apuntes", tareas: "tareas", examenes: "exámenes" };

const piezasEstudio = document.getElementById("piezasEstudio");
const filtroMateria = document.getElementById("filtroMateria");
const tarjetas = document.getElementById("tarjetas");

// ───── Apoyo: una pieza por materia ─────
function agregarMateria(materia, n) {
  tarjetas.insertAdjacentHTML("beforeend", `
    <article class="pieza" id="tarjeta-${escapar(materia.slug)}">
      <div class="pieza__meta"><span class="rotulo">${codigo("APO", n)}</span><span class="rotulo">${materia.cursos} cursos</span></div>
      ${imagenMateria(materia)}
      <h3 class="pieza__titulo">${escapar(materia.nombre)}</h3>
      ${materia.descripcion ? `<p class="pieza__texto">${escapar(materia.descripcion)}</p>` : ""}
      <p class="pieza__datos"><span>Apuntes: <b>${materia.archivos}</b></span><span>Asesores: <b>${materia.asesores.length}</b></span></p>
      <div class="pieza__pie">
        <div class="chips"><span class="chip">Asesores</span><span class="chip">Material</span></div>
        <a class="pieza__enlace pieza__enlace--cubre" href="materia.html?m=${encodeURIComponent(materia.slug)}">Apoyo <span class="flecha">${icono("flecha", "icono--16")}</span></a>
      </div>
    </article>`);
}

async function cargarMaterias() {
  try {
    ({ materias } = await API.get("materias.php"));
  } catch {
    tarjetas.innerHTML = `<div class="vacio"><p>No pudimos cargar las materias. Revisa que el servidor y el túnel de la base de datos estén encendidos.</p></div>`;
    return;
  }
  tarjetas.innerHTML = "";
  materias.forEach((m, i) => agregarMateria(m, i + 1));
  if (!materias.length) tarjetas.innerHTML = `<div class="vacio"><p>Todavía no hay materias.</p></div>`;
  document.getElementById("cotaApoyo").innerHTML = cota(materias.length, materias.length === 1 ? "materia" : "materias");
  filtroMateria.innerHTML = `<option value="">Todas las materias</option>` +
    materias.map(m => `<option value="${m.id}">${escapar(m.nombre)}</option>`).join("");
  Animar.registrar();
}

// ───── Estudio: apuntes, tareas y exámenes ─────
async function cargarEstudio() {
  let archivos = [];
  try {
    ({ archivos } = await API.get("archivos.php", { seccion: seccionActual, materia_id: filtroMateria.value }));
  } catch {
    piezasEstudio.innerHTML = `<div class="vacio"><p>No pudimos cargar el material. Intenta de nuevo en un momento.</p></div>`;
    return;
  }
  const nombre = NOMBRES_SECCION[seccionActual];
  piezasEstudio.innerHTML = archivos.length
    ? archivos.map((a, i) => Archivos.pieza(a, archivos.length - i)).join("")
    : `<div class="vacio"><p>Todavía no hay ${nombre}${filtroMateria.value ? " de esta materia" : ""}.</p></div>`;
  const cotaEstudio = document.getElementById("cotaEstudio");
  cotaEstudio.innerHTML = cota(archivos.length, archivos.length === 1 ? "recurso" : "recursos");
  Animar.registrar(cotaEstudio);
  Archivos.vigilar(archivos, cargarEstudio);
}

document.getElementById("pestanasEstudio").addEventListener("click", e => {
  const pestana = e.target.closest("[data-seccion]");
  if (!pestana) return;
  seccionActual = pestana.dataset.seccion;
  document.querySelectorAll("#pestanasEstudio [data-seccion]").forEach(p =>
    p.setAttribute("aria-selected", String(p === pestana)));
  document.getElementById("subirEstudio").textContent = `Subir ${{ apuntes: "apunte", tareas: "tarea", examenes: "examen" }[seccionActual]}`;
  cargarEstudio();
});
filtroMateria.addEventListener("change", cargarEstudio);
Archivos.activarBorrado(piezasEstudio, cargarEstudio);

document.getElementById("subirEstudio").textContent = "Subir apunte";
document.getElementById("subirEstudio").addEventListener("click", () => Archivos.abrir({
  seccion: seccionActual,
  materias,
  rotulo: `Estudio · ${NOMBRES_SECCION[seccionActual]}`,
  titulo: `Subir ${{ apuntes: "apunte", tareas: "tarea", examenes: "examen" }[seccionActual]}`,
  materia_id: filtroMateria.value || null,
  alTerminar: cargarEstudio
}));

// ───── Nueva materia (solo admin) ─────
const dialogoMateria = document.getElementById("dialogoMateria");
const formulario = document.getElementById("formulario");
const botonAgregar = document.getElementById("agregarMateria");
botonAgregar.innerHTML = `${icono("mas", "icono--16")} Agregar materia`;
botonAgregar.addEventListener("click", () => {
  formulario.reset();
  document.getElementById("errorMateria").textContent = "";
  dialogoMateria.showModal();
});
document.getElementById("cancelar").addEventListener("click", () => dialogoMateria.close());

formulario.addEventListener("submit", async e => {
  e.preventDefault();
  const nombre = document.getElementById("nombre").value.trim();
  if (!nombre) return;
  try {
    await API.post("materias.php", {
      nombre,
      simbolo: document.getElementById("simbolo").value.trim() || nombre.slice(0, 3).toUpperCase(),
      descripcion: document.getElementById("descripcion").value.trim()
    }, { accion: "crear" });
    dialogoMateria.close();
    avisar(`Materia «${nombre}» creada.`);
    await cargarMaterias();
  } catch (err) {
    document.getElementById("errorMateria").textContent = "No se pudo guardar la materia: " + err.message;
  }
});

cargarMaterias().then(cargarEstudio);
