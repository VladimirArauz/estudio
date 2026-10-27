// Muestra la vista HTML generada de un archivo, con reproductor sincronizado a la transcripción.

const LAMINA_DE = {
  apuntes: ["estudio", "Lámina 01 · Estudio", "index.html#estudio", "var(--sec-estudio)"],
  tareas: ["estudio", "Lámina 01 · Estudio", "index.html#estudio", "var(--sec-estudio)"],
  examenes: ["estudio", "Lámina 01 · Estudio", "index.html#estudio", "var(--sec-estudio)"],
  apoyo: ["apoyo", "Lámina 02 · Apoyo", "index.html#apoyo", "var(--sec-apoyo)"],
  curso: ["apoyo", "Curso", "cursos.html", "var(--sec-apoyo)"],
  entrega: ["apoyo", "Entrega", "cursos.html", "var(--sec-apoyo)"]
};

const id = Number(parametro("id"));
const encabezado = document.getElementById("encabezado");
const vista = document.getElementById("vista");

function pintarEncabezado(a) {
  const [activa, miga, enlace, sec] = LAMINA_DE[a.seccion] || LAMINA_DE.apuntes;
  document.body.dataset.activa = activa;
  document.body.style.setProperty("--sec", sec);
  document.title = `${a.titulo} · Bátiz hasta la muerte`;
  const destino = a.seccion === "curso" || a.seccion === "entrega" ? `curso.html?id=${a.curso_id}` : enlace;
  const tipo = TIPOS_ARCHIVO[a.tipo] || TIPOS_ARCHIVO.otro;
  encabezado.innerHTML = `
    <nav class="migas" aria-label="Ruta"><a href="${destino}">${miga}</a><span>/</span><span>${escapar(a.materia || "General")}</span></nav>
    <p class="rotulo">${tipo.nombre} · ${escapar(a.nombre_original)} · ${tamano(a.bytes)}</p>
    <h1 class="cabecera-pagina__titulo">${escapar(a.titulo)}</h1>
    <div class="cota" aria-hidden="true"><span class="cota__linea"></span><span class="cota__medida">${fecha(a.creado)}</span></div>
    <div class="fila fila--entre">
      <p class="pieza__datos"><span>Subido por <b>${escapar(a.autor || "Anónimo")}</b></span>
        ${a.vista && a.vista.paginas ? `<span><b>${a.vista.paginas}</b> páginas</span>` : ""}
        ${a.vista && a.vista.duracion ? `<span><b>${duracion(a.vista.duracion)}</b></span>` : ""}</p>
      <div class="fila">
        <a class="btn btn--secundario btn--sm" href="${API.url("archivo.php", { id: a.id, modo: "original", descargar: 1 })}">${icono("bajar", "icono--16")} Descargar original</a>
        ${a.puede_borrar && a.estado !== "procesando" ? `<button class="btn btn--secundario btn--sm" type="button" id="reprocesar">${icono("recargar", "icono--16")} Volver a procesar</button>` : ""}
      </div>
    </div>`;
  Animar.registrar(encabezado);
  document.getElementById("reprocesar")?.addEventListener("click", async () => {
    try {
      await API.post("archivos.php", { id: a.id }, { accion: "reprocesar" });
      avisar("Volvimos a poner el archivo en cola.");
      cargar();
    } catch (err) { avisar(err.message, "error"); }
  });
}

// Clic en un tiempo o una frase → el reproductor salta ahí. La frase actual se resalta.
function sincronizarMedio() {
  const medio = vista.querySelector("audio, video");
  if (!medio) return;
  vista.addEventListener("click", e => {
    const marca = e.target.closest("[data-seek]");
    if (!marca) return;
    medio.currentTime = Number(marca.dataset.seek);
    medio.play().catch(() => {});
    medio.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  const frases = [...vista.querySelectorAll(".vista-transcripcion__lista span[data-seek]")];
  if (!frases.length) return;
  let actual = null;
  medio.addEventListener("timeupdate", () => {
    const t = medio.currentTime;
    let elegida = null;
    for (const f of frases) { if (Number(f.dataset.seek) <= t) elegida = f; else break; }
    if (elegida !== actual) {
      actual?.classList.remove("actual");
      elegida?.classList.add("actual");
      actual = elegida;
    }
  });
}

async function cargar() {
  let a;
  try {
    ({ archivo: a } = await API.get("archivos.php", { id }));
  } catch (err) {
    encabezado.innerHTML = `<h1 class="cabecera-pagina__titulo">Archivo no encontrado</h1>
      <p>Puede que se haya eliminado o que no tengas permiso para verlo. <a href="index.html">Volver al inicio</a></p>`;
    return;
  }
  pintarEncabezado(a);

  if (a.estado === "pendiente" || a.estado === "procesando") {
    vista.innerHTML = `<div class="nota nota--aviso"><p class="rotulo">${a.estado === "pendiente" ? "En cola" : "Procesando"}</p>
      <p>Estamos generando la vista de este archivo. Los videos y audios largos pueden tardar varios minutos; esta página se actualiza sola.</p></div>`;
    setTimeout(cargar, 5000);
    return;
  }
  if (a.estado === "error") {
    vista.innerHTML = `<div class="nota nota--error"><p class="rotulo">No se pudo procesar</p>
      <p>${escapar(a.error || "Error desconocido")}</p><p>Puedes descargar el original o volver a procesarlo.</p></div>`;
    return;
  }
  const respuesta = await fetch(API.url("archivo.php", { id: a.id, modo: "vista" }), { credentials: "same-origin" });
  // El HTML ya viene saneado por el procesador (bleach) con una lista blanca de etiquetas.
  vista.innerHTML = respuesta.ok ? await respuesta.text() : `<div class="nota nota--error"><p>No se encontró la vista generada.</p></div>`;
  sincronizarMedio();
}

cargar();
