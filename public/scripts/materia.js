// Página de una materia: asesores, material de apoyo y cursos.

const tipos = [
  { id: "documentos", nombre: "Documentos" },
  { id: "videos", nombre: "Videos" },
  { id: "imagenes", nombre: "Imágenes" },
  { id: "audios", nombre: "Audios" },
  { id: "otros", nombre: "Otros" }
];

const slug = parametro("m");
const pestanas = document.getElementById("pestanas");
const listaMaterial = document.getElementById("listaMaterial");
let materia;
let archivos = [];
let tipoActual = "documentos";
let yo;

function mostrarVista(vistaId) {
  document.querySelectorAll("[role=tabpanel]").forEach(s => s.hidden = s.id !== vistaId);
  document.querySelectorAll("#vistas [data-vista]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.vista === vistaId)));
  if (vistaId === "vistaCursos") cargarCursos();
  history.replaceState(null, "", `#${vistaId.replace("vista", "").toLowerCase()}`);
}

// ───── Material ─────
async function cargarArchivos() {
  try {
    ({ archivos } = await API.get("archivos.php", { seccion: "apoyo", materia_id: materia.id }));
  } catch { archivos = []; }
  mostrarTipo(tipoActual);
  Archivos.vigilar(archivos, cargarArchivos);
}

function mostrarTipo(tipoId) {
  tipoActual = tipoId;
  const tipo = tipos.find(t => t.id === tipoId);
  const conteo = id => archivos.filter(a => (TIPOS_ARCHIVO[a.tipo] || TIPOS_ARCHIVO.otro).grupo === id).length;
  pestanas.innerHTML = tipos.map(t =>
    `<button class="chip" type="button" data-tipo="${t.id}" aria-pressed="${t.id === tipoId}">${t.nombre} · ${conteo(t.id)}</button>`).join("");
  const elementos = archivos.filter(a => (TIPOS_ARCHIVO[a.tipo] || TIPOS_ARCHIVO.otro).grupo === tipoId);
  listaMaterial.innerHTML = elementos.length
    ? elementos.map(Archivos.fila).join("")
    : `<li><span class="texto-2">Todavía no hay ${tipo.nombre.toLowerCase()}.</span></li>`;
}

// ───── Cursos ─────
async function cargarCursos() {
  const lista = document.getElementById("listaCursos");
  if (!lista.children.length) Esqueleto.poner(lista, Esqueleto.piezas(2), "Cargando cursos…");
  let datos;
  try {
    datos = await API.get("cursos.php", { materia_id: materia.id });
  } catch (err) {
    lista.innerHTML = `<div class="vacio"><p>${escapar(err.message)}</p></div>`;
    return;
  }
  const { cursos, postulacion } = datos;
  lista.innerHTML = cursos.length ? cursos.map((c, i) => `
    <article class="pieza">
      <div class="pieza__meta"><span class="rotulo">${codigo("CUR", i + 1)}</span><span class="rotulo">${c.alumnos} alumnos</span></div>
      <h3 class="pieza__titulo pieza__titulo--sm">${escapar(c.titulo)}</h3>
      ${c.descripcion ? `<p class="pieza__texto">${escapar(c.descripcion)}</p>` : ""}
      <p class="pieza__datos"><span>Profesor: <b>${escapar(c.profesor)}</b></span>
        <span>Evaluación: <b>${c.calificacion ? Number(c.calificacion).toFixed(1) + " / 5" : "sin evaluar"}</b></span></p>
      <div class="pieza__pie">
        <div class="chips">${c.inscrito ? '<span class="chip chip--ok">Inscrito</span>' : ""}${c.es_mio ? '<span class="chip chip--activo">Tu curso</span>' : ""}</div>
        ${c.inscrito || c.es_mio || yo.rol === "admin"
          ? `<a class="pieza__enlace" href="curso.html?id=${c.id}">Abrir curso <span class="flecha">${icono("flecha", "icono--16")}</span></a>`
          : yo.rol === "alumno"
            ? `<button class="btn btn--sm btn--secundario" type="button" data-inscribir="${c.id}">Inscribirme al curso</button>`
            : yo.rol === "invitado" ? `<a class="pieza__enlace" href="login.html">Inicia sesión para inscribirte</a>` : ""}
      </div>
    </article>`).join("")
    : `<div class="vacio"><p>Todavía no hay cursos de ${escapar(materia.nombre)}.</p></div>`;

  // Acciones del profesor según el estado de su postulación.
  const acciones = document.getElementById("accionesProfesor");
  if (yo.rol === "admin" || postulacion === "aprobada") {
    acciones.innerHTML = `<button class="btn btn--secundario" type="button" id="crearCurso">${icono("mas", "icono--16")} Crear curso</button>`;
  } else if (postulacion === "pendiente") {
    acciones.innerHTML = `<span class="chip chip--aviso">Postulación en revisión</span>`;
  } else if (postulacion === "rechazada") {
    acciones.innerHTML = `<span class="chip chip--error">Postulación rechazada</span>`;
  } else {
    acciones.innerHTML = `<button class="btn btn--secundario" type="button" id="postular">Postularme como profesor</button>`;
  }
}

document.getElementById("listaCursos").addEventListener("click", async e => {
  const boton = e.target.closest("[data-inscribir]");
  if (!boton) return;
  boton.disabled = true;
  try {
    await API.post("cursos.php", { curso_id: Number(boton.dataset.inscribir) }, { accion: "inscribir" });
    avisar("Te inscribiste al curso.");
    location.href = `curso.html?id=${boton.dataset.inscribir}`;
  } catch (err) { avisar(err.message, "error"); boton.disabled = false; }
});

document.getElementById("accionesProfesor").addEventListener("click", e => {
  if (e.target.closest("#postular")) document.getElementById("dialogoPostular").showModal();
  if (e.target.closest("#crearCurso")) document.getElementById("dialogoCurso").showModal();
});
document.querySelectorAll("dialog [data-cerrar]").forEach(b => b.addEventListener("click", () => b.closest("dialog").close()));

function formularioDialogo(formId, accion, datos, alTerminar) {
  const form = document.getElementById(formId);
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const error = form.querySelector(".form__mensaje");
    error.textContent = "";
    try {
      const r = await API.post("cursos.php", datos(), { accion });
      form.closest("dialog").close();
      form.reset();
      alTerminar(r);
    } catch (err) { error.textContent = err.message; }
  });
}
formularioDialogo("formPostular", "postular",
  () => ({ materia_id: materia.id, mensaje: document.getElementById("mensajePostular").value.trim() }),
  () => { avisar("Postulación enviada. La administración la revisará."); cargarCursos(); });
formularioDialogo("formCurso", "crear",
  () => ({ materia_id: materia.id, titulo: document.getElementById("tituloCurso").value.trim(), descripcion: document.getElementById("descripcionCurso").value.trim() }),
  r => { location.href = `curso.html?id=${r.id}`; });

// ───── Inicio ─────
function iniciar() {
  document.title = `Apoyo – ${materia.nombre} · Bátiz hasta la muerte`;
  document.getElementById("migaMateria").textContent = materia.nombre;
  document.getElementById("encabezado").insertAdjacentHTML("beforeend", `
    <p class="rotulo">Lámina 02 · APO · Materia ${String(materia.id).padStart(3, "0")}</p>
    <h1 class="cabecera-pagina__titulo">${escapar(materia.nombre)}</h1>
    ${cota(materia.archivos, "archivos de apoyo")}
    ${materia.descripcion ? `<p class="lamina__lead">${escapar(materia.descripcion)}</p>` : ""}`);
  Esqueleto.quitar(document.getElementById("encabezado"));
  Animar.registrar();

  document.getElementById("listaAsesores").innerHTML = materia.asesores.length
    ? materia.asesores.map((a, i) => `<li><span class="rotulo">${codigo("ASE", i + 1)}</span>
        <div class="filas__principal"><span class="filas__titulo">${escapar(a)}</span></div>${icono("usuario")}</li>`).join("")
    : `<li><span class="texto-2">Todavía no hay asesores.</span></li>`;

  document.getElementById("vistas").addEventListener("click", e => {
    const b = e.target.closest("[data-vista]");
    if (b) mostrarVista(b.dataset.vista);
  });
  pestanas.addEventListener("click", e => {
    const p = e.target.closest("[data-tipo]");
    if (p) mostrarTipo(p.dataset.tipo);
  });
  Archivos.activarBorrado(listaMaterial, cargarArchivos);

  document.getElementById("agregar").innerHTML = `${icono("subir", "icono--16")} Subir material`;
  document.getElementById("agregar").addEventListener("click", () => Archivos.abrir({
    seccion: "apoyo",
    materia_id: materia.id,
    rotulo: `Apoyo · ${materia.nombre}`,
    titulo: "Subir material",
    alTerminar: () => { mostrarVista("vistaMaterial"); cargarArchivos(); }
  }));

  const inicial = { "#material": "vistaMaterial", "#cursos": "vistaCursos" }[location.hash] || "vistaAsesores";
  mostrarVista(inicial);
  Esqueleto.poner(listaMaterial, Esqueleto.filas(3), "Cargando material…");
  cargarArchivos();
}

Esqueleto.poner(document.getElementById("encabezado"), Esqueleto.encabezado(), "Cargando materia…", { agregar: true });
(async () => {
  yo = await Sesion.yo();
  try {
    ({ materia } = await API.get("materias.php", { slug }));
  } catch {
    document.getElementById("encabezado").innerHTML = `<h1 class="cabecera-pagina__titulo">Materia no encontrada</h1>
      <p><a href="index.html#apoyo">Volver a Apoyo</a></p>`;
    document.querySelector("#contenido > .pila").hidden = true;
    return;
  }
  iniciar();
})();
