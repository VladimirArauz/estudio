// Panel de administración.

let panel = document.getElementById("panelAdmin");
const SECCIONES = [["resumen", "Resumen"], ["usuarios", "Usuarios"], ["materias", "Materias"], ["contenido", "Contenido"],
  ["postulaciones", "Postulaciones"], ["cursos", "Cursos"], ["examenes", "Exámenes"], ["guias", "Guías de examen"], ["analitica", "Analítica"], ["logs", "Logs"]];
const ROLES = { admin: "Admin", profesor: "Profesor", alumno: "Alumno" };

const n = v => Math.round(Number(v) || 0);
const tabla = (cabeceras, filas, vacio = "Sin datos.") => filas.length
  ? `<div class="tabla-caja"><table class="tabla"><thead><tr>${cabeceras.map(c => `<th${c.startsWith("#") ? ' class="num"' : ""}>${c.replace("#", "")}</th>`).join("")}</tr></thead>
     <tbody>${filas.join("")}</tbody></table></div>`
  : `<div class="vacio"><p>${vacio}</p></div>`;
const barras = (items, sufijo = "") => {
  const max = Math.max(1, ...items.map(([, v]) => Number(v)));
  return `<ul class="barras">${items.map(([nombre, v, extra]) => `
    <li class="barra"><span class="barra__nombre" title="${escapar(nombre)}">${escapar(nombre)}</span>
      <span class="barra__pista"><span class="barra__relleno" style="--v:${(Number(v) / max).toFixed(3)}"></span></span>
      <span class="barra__valor">${extra ?? n(v) + sufijo}</span></li>`).join("")}</ul>`;
};
const kpi = (rotulo, valor, nota = "") => `<div class="kpi"><span class="rotulo">${rotulo}</span><span class="kpi__valor">${valor}</span>${nota ? `<span class="kpi__nota">${nota}</span>` : ""}</div>`;
const paginacion = d => d.paginas > 1 ? `<div class="fila fila--entre"><span class="rotulo">Página ${d.pagina} de ${d.paginas} · ${d.total} registros</span>
  <div class="fila"><button class="btn btn--sm btn--secundario" data-pagina="${d.pagina - 1}" ${d.pagina <= 1 ? "disabled" : ""}>Anterior</button>
  <button class="btn btn--sm btn--secundario" data-pagina="${d.pagina + 1}" ${d.pagina >= d.paginas ? "disabled" : ""}>Siguiente</button></div></div>`
  : `<p class="rotulo">${d.total} registros</p>`;

// Filtros en la URL (?seccion#usuarios&q=…) para que se puedan compartir y recargar.
let filtros = {};
function campoFiltro(nombre, etiqueta, opciones, vacio = "Todos") {
  const valor = escapar(filtros[nombre] || "");
  if (opciones) return `<div class="campo"><label for="f_${nombre}">${etiqueta}</label><select id="f_${nombre}" data-filtro="${nombre}">
    <option value="">${vacio}</option>${opciones.map(([v, t]) => `<option value="${v}" ${filtros[nombre] === v ? "selected" : ""}>${t}</option>`).join("")}</select></div>`;
  return `<div class="campo"><label for="f_${nombre}">${etiqueta}</label><input id="f_${nombre}" data-filtro="${nombre}" value="${valor}" type="search"></div>`;
}

/* ───────── Resumen ───────── */
async function resumen() {
  const d = await API.get("admin.php", { seccion: "resumen" });
  const k = d.kpis;
  panel.innerHTML = `
    <div class="kpis">
      ${kpi("Usuarios", n(k.admins) + n(k.profesores) + n(k.alumnos), `${k.alumnos} alumnos · ${k.profesores} profesores · ${k.admins} admin`)}
      ${kpi("Nuevos (7 días)", k.usuarios_nuevos)}
      ${kpi("Archivos", k.archivos, `${tamano(k.bytes)} · ${k.archivos_cola} en cola`)}
      ${kpi("Con error", k.archivos_error, k.archivos_error > 0 ? '<a href="#contenido" data-ir="contenido" data-estado="error">Revisar</a>' : "Todo bien")}
      ${kpi("Cursos activos", k.cursos)}
      ${kpi("Postulaciones", k.postulaciones, k.postulaciones > 0 ? '<a href="#postulaciones" data-ir="postulaciones">Pendientes de revisar</a>' : "Ninguna pendiente")}
      ${kpi("Exámenes hechos", k.intentos, `Promedio ${n(k.promedio_examenes)} %`)}
      ${kpi("Visitas hoy", k.visitas_hoy, `${k.visitas_7d} en 7 días · ${duracion(k.segundos_promedio)} promedio`)}
    </div>
    <div class="lamina__rejilla" style="row-gap: var(--e-6)">
      <div class="pila" style="grid-column: 1 / span 6"><p class="rotulo">Subidas por día · últimos 14 días</p>
        ${d.subidas.length ? barras(d.subidas.map(s => [fecha(s.dia), s.n])) : '<p class="texto-2">Sin subidas recientes.</p>'}</div>
      <div class="pila" style="grid-column: 7 / -1"><p class="rotulo">Archivos por tipo</p>
        ${d.por_tipo.length ? barras(d.por_tipo.map(t => [(TIPOS_ARCHIVO[t.tipo] || TIPOS_ARCHIVO.otro).nombre, t.n])) : '<p class="texto-2">Sin archivos.</p>'}</div>
    </div>
    <div class="pila"><p class="rotulo">Actividad reciente</p>
      <ul class="filas">${d.recientes.map(l => `<li><span class="rotulo">${fecha(l.fecha, true)}</span>
        <div class="filas__principal"><span class="filas__titulo">${escapar(l.nombre || "Invitado")}</span>
        <span class="filas__meta">${escapar(l.accion)}${l.objeto_tipo ? ` · ${escapar(l.objeto_tipo)} #${l.objeto_id}` : ""}</span></div></li>`).join("")}</ul></div>`;
}

/* ───────── Usuarios ───────── */
async function usuarios() {
  const d = await API.get("admin.php", { seccion: "usuarios", ...filtros });
  panel.innerHTML = `
    <form class="form__fila" data-filtros>${campoFiltro("q", "Buscar nombre o correo")}${campoFiltro("rol", "Rol", Object.entries(ROLES))}</form>
    ${paginacion(d)}
    ${tabla(["Nombre", "Correo", "Rol", "Estado", "Alta", "Último acceso", "#Archivos", "#Tiempo en sitio", ""], d.filas.map(u => `
      <tr data-usuario="${u.id}">
        <td>${escapar(u.nombre)}</td><td class="mono">${escapar(u.email)}</td>
        <td><select class="input" data-rol aria-label="Rol de ${escapar(u.nombre)}">${Object.entries(ROLES).map(([v, t]) => `<option value="${v}" ${u.rol === v ? "selected" : ""}>${t}</option>`).join("")}</select></td>
        <td><span class="chip ${u.estado === "activo" ? "chip--ok" : "chip--error"}">${u.estado}</span></td>
        <td class="mono">${fecha(u.creado)}</td><td class="mono">${u.ultimo_acceso ? fecha(u.ultimo_acceso, true) : "—"}</td>
        <td class="num">${u.archivos}</td><td class="num">${duracion(u.segundos)}</td>
        <td class="acciones"><button class="btn btn--sm btn--secundario" data-estado="${u.estado === "activo" ? "suspendido" : "activo"}">${u.estado === "activo" ? "Suspender" : "Reactivar"}</button>
          <button class="btn btn--sm btn--secundario" data-password>Restablecer contraseña</button></td>
      </tr>`), "No hay usuarios con ese filtro.")}`;
  panel.addEventListener("change", async e => {
    const sel = e.target.closest("[data-rol]");
    if (!sel) return;
    try { await API.post("admin.php", { id: Number(sel.closest("tr").dataset.usuario), rol: sel.value }, { accion: "usuario_rol" }); avisar("Rol actualizado. Se aplica en menos de un minuto."); }
    catch (err) { avisar(err.message, "error"); usuarios(); }
  });
  panel.addEventListener("click", async e => {
    const fila = e.target.closest("tr[data-usuario]");
    if (!fila) return;
    const id = Number(fila.dataset.usuario);
    if (e.target.closest("[data-estado]")) {
      const estado = e.target.closest("[data-estado]").dataset.estado;
      try { await API.post("admin.php", { id, estado }, { accion: "usuario_estado" }); avisar(estado === "suspendido" ? "Cuenta suspendida." : "Cuenta reactivada."); mostrar("usuarios"); }
      catch (err) { avisar(err.message, "error"); }
    }
    if (e.target.closest("[data-password]")) {
      if (!confirm("¿Generar una contraseña temporal para esta cuenta? La actual dejará de funcionar.")) return;
      const r = await API.post("admin.php", { id }, { accion: "usuario_password" });
      prompt("Contraseña temporal (cópiala y entrégala a la persona; no se volverá a mostrar):", r.temporal);
    }
  });
}

/* ───────── Materias ───────── */
async function materias() {
  const { materias: lista } = await API.get("materias.php");
  panel.innerHTML = `
    <div class="herramientas"><p class="rotulo">${lista.length} materias · se muestran en la lámina Apoyo</p>
      <button class="btn btn--secundario" type="button" data-nueva>${icono("mas", "icono--16")} Agregar materia</button></div>
    ${tabla(["#Orden", "Materia", "Área", "Símbolo", "#Asesores", "#Archivos", "#Cursos", ""], lista.map(m => `
      <tr data-materia="${m.id}"><td class="num">${m.orden}</td><td><a href="materia.html?m=${encodeURIComponent(m.slug)}">${escapar(m.nombre)}</a></td>
        <td>${escapar(m.area)}</td><td class="mono">${escapar(m.simbolo)}</td><td class="num">${m.asesores.length}</td><td class="num">${m.archivos}</td><td class="num">${m.cursos}</td>
        <td class="acciones"><button class="btn btn--sm btn--secundario" data-editar>Editar</button>
          <button class="btn btn--sm btn--peligro" data-borrar>Eliminar</button></td></tr>`), "Todavía no hay materias.")}`;
  const dialogo = document.getElementById("dialogoMateria");
  const form = document.getElementById("formMateria");
  let editando = null;
  document.getElementById("listaAreas").innerHTML = porArea(lista).map(([area]) => `<option value="${escapar(area)}">`).join("");
  const abrir = m => {
    editando = m;
    document.getElementById("tituloDialogoMateria").textContent = m ? `Editar ${m.nombre}` : "Nueva materia";
    form.querySelector("#mNombre").value = m?.nombre || "";
    form.querySelector("#mSimbolo").value = m?.simbolo || "";
    form.querySelector("#mOrden").value = m?.orden ?? lista.length + 1;
    form.querySelector("#mArea").value = m?.area || "";
    form.querySelector("#mDescripcion").value = m?.descripcion || "";
    form.querySelector("#mAsesores").value = (m?.asesores || []).join("\n");
    form.querySelector(".form__mensaje").textContent = "";
    dialogo.showModal();
  };
  form.onsubmit = async e => {
    e.preventDefault();
    const datos = { id: editando?.id, nombre: form.querySelector("#mNombre").value.trim(), simbolo: form.querySelector("#mSimbolo").value.trim(),
      orden: Number(form.querySelector("#mOrden").value), area: form.querySelector("#mArea").value.trim(),
      descripcion: form.querySelector("#mDescripcion").value.trim(),
      asesores: form.querySelector("#mAsesores").value.split("\n").map(s => s.trim()).filter(Boolean) };
    try { await API.post("materias.php", datos, { accion: editando ? "editar" : "crear" }); dialogo.close(); avisar("Materia guardada."); materias(); }
    catch (err) { form.querySelector(".form__mensaje").textContent = err.message; }
  };
  dialogo.querySelector("[data-cerrar]").onclick = () => dialogo.close();
  panel.addEventListener("click", async e => {
    if (e.target.closest("[data-nueva]")) return abrir(null);
    const fila = e.target.closest("tr[data-materia]");
    if (!fila) return;
    const m = lista.find(x => x.id === Number(fila.dataset.materia));
    if (e.target.closest("[data-editar]")) abrir(m);
    if (e.target.closest("[data-borrar]") && confirm(`¿Eliminar «${m.nombre}»? Sus cursos y asesores se borran; los archivos quedan como «General».`)) {
      await API.post("materias.php", { id: m.id }, { accion: "borrar" });
      avisar("Materia eliminada.");
      materias();
    }
  });
}

/* ───────── Contenido ───────── */
async function contenido() {
  const d = await API.get("admin.php", { seccion: "contenido", ...filtros });
  const secciones = [["apuntes", "Apuntes"], ["tareas", "Tareas"], ["examenes", "Exámenes"], ["apoyo", "Apoyo"], ["curso", "Curso"], ["entrega", "Entrega"], ["guia", "Guía de examen"]];
  panel.innerHTML = `
    <form class="form__fila" data-filtros>${campoFiltro("q", "Buscar título")}${campoFiltro("seccion_archivo", "Sección", secciones)}
      ${campoFiltro("estado", "Estado", Object.entries(ESTADOS_ARCHIVO).map(([k, v]) => [k, v.texto]))}
      ${campoFiltro("tipo", "Tipo", Object.entries(TIPOS_ARCHIVO).map(([k, v]) => [k, v.nombre]))}</form>
    ${paginacion(d)}
    ${tabla(["Archivo", "Sección", "Autor", "Materia", "#Tamaño", "#Visitas", "Estado", "Subido", ""], d.filas.map(a => `
      <tr data-archivo="${a.id}"><td><a href="ver.html?id=${a.id}">${escapar(a.titulo)}</a><br><small class="texto-3 mono">${escapar(a.nombre_original)}</small></td>
        <td>${escapar(a.seccion)}</td><td>${escapar(a.autor || "—")}</td><td>${escapar(a.materia || "General")}</td>
        <td class="num">${tamano(a.bytes)}</td><td class="num">${a.visitas}</td>
        <td><span class="chip ${ESTADOS_ARCHIVO[a.estado].clase}" title="${escapar(a.error || "")}">${ESTADOS_ARCHIVO[a.estado].texto}</span></td>
        <td class="mono">${fecha(a.creado, true)}</td>
        <td class="acciones"><button class="btn btn--sm btn--secundario" data-reprocesar>Reprocesar</button>
          <button class="btn btn--sm btn--peligro" data-borrar>Eliminar</button></td></tr>`), "No hay archivos con ese filtro.")}`;
  panel.addEventListener("click", async e => {
    const fila = e.target.closest("tr[data-archivo]");
    if (!fila) return;
    const id = Number(fila.dataset.archivo);
    try {
      if (e.target.closest("[data-reprocesar]")) { await API.post("archivos.php", { id }, { accion: "reprocesar" }); avisar("Archivo en cola otra vez."); contenido(); }
      if (e.target.closest("[data-borrar]") && confirm("¿Eliminar el archivo y su vista generada?")) { await API.post("archivos.php", { id }, { accion: "borrar" }); avisar("Archivo eliminado."); contenido(); }
    } catch (err) { avisar(err.message, "error"); }
  });
}

/* ───────── Postulaciones ───────── */
async function postulaciones() {
  const { filas } = await API.get("admin.php", { seccion: "postulaciones" });
  const clase = { pendiente: "chip--aviso", aprobada: "chip--ok", rechazada: "chip--error" };
  panel.innerHTML = tabla(["Persona", "Materia", "Mensaje", "Estado", "Fecha", ""], filas.map(p => `
    <tr data-postulacion="${p.id}"><td>${escapar(p.nombre)}<br><small class="mono texto-3">${escapar(p.email)}</small></td><td>${escapar(p.materia)}</td>
      <td style="max-width: 28rem">${escapar(p.mensaje || "")}</td>
      <td><span class="chip ${clase[p.estado]}">${p.estado}</span>${p.revisor ? `<br><small class="texto-3">por ${escapar(p.revisor)}</small>` : ""}</td>
      <td class="mono">${fecha(p.creado)}</td>
      <td class="acciones">${p.estado === "pendiente" ? `<button class="btn btn--sm btn--secundario" data-estado="aprobada">Aprobar</button>
        <button class="btn btn--sm btn--peligro" data-estado="rechazada">Rechazar</button>` : ""}</td></tr>`), "No hay postulaciones.");
  panel.addEventListener("click", async e => {
    const b = e.target.closest("[data-estado]");
    if (!b) return;
    await API.post("admin.php", { id: Number(b.closest("tr").dataset.postulacion), estado: b.dataset.estado }, { accion: "postulacion" });
    avisar(b.dataset.estado === "aprobada" ? "Postulación aprobada: ya puede abrir su curso." : "Postulación rechazada.");
    postulaciones();
  });
}

/* ───────── Cursos ───────── */
async function cursos() {
  const d = await API.get("admin.php", { seccion: "cursos" });
  panel.innerHTML = `
    ${tabla(["Curso", "Materia", "Profesor", "#Alumnos", "#Visitas", "Curso", "Profesor", "Estado", ""], d.cursos.map(c => `
      <tr data-curso="${c.id}"><td><a href="curso.html?id=${c.id}">${escapar(c.titulo)}</a></td><td>${escapar(c.materia)}</td><td>${escapar(c.profesor)}</td>
        <td class="num">${c.alumnos}</td><td class="num">${c.visitas}</td>
        <td>${c.evaluaciones > 0 ? estrellas(c.estrellas_curso) : "—"}</td><td>${c.evaluaciones > 0 ? estrellas(c.estrellas_profesor) : "—"}</td>
        <td><span class="chip ${c.estado === "activo" ? "chip--ok" : ""}">${c.estado}</span></td>
        <td class="acciones"><button class="btn btn--sm btn--secundario" data-estado="${c.estado === "activo" ? "archivado" : "activo"}">${c.estado === "activo" ? "Archivar" : "Reactivar"}</button></td></tr>`), "Todavía no hay cursos.")}
    <div class="pila"><p class="rotulo">Evaluaciones de cursos y profesores</p>
      ${d.evaluaciones.length ? `<ul class="filas">${d.evaluaciones.map(e => `<li><div class="filas__principal">
        <span class="filas__meta">${escapar(e.curso)} · ${escapar(e.alumno)} · ${fecha(e.creado)}</span>
        <span>Curso ${estrellas(e.estrellas_curso)} Profesor ${estrellas(e.estrellas_profesor)}</span>
        ${e.comentario ? `<span class="texto-2">${escapar(e.comentario)}</span>` : ""}</div></li>`).join("")}</ul>` : '<p class="texto-2">Sin evaluaciones.</p>'}</div>`;
  panel.addEventListener("click", async e => {
    const b = e.target.closest("[data-estado]");
    if (!b) return;
    await API.post("admin.php", { id: Number(b.closest("tr").dataset.curso), estado: b.dataset.estado }, { accion: "curso_estado" });
    cursos();
  });
}

/* ───────── Exámenes ───────── */
async function examenes() {
  const d = await API.get("admin.php", { seccion: "examenes" });
  panel.innerHTML = `
    <div class="kpis">${kpi("IA hoy", d.ia.hoy, "exámenes generados")}${kpi("IA 30 días", d.ia.mes)}${kpi("En caché", d.ia.en_cache, "no gastan cuota")}</div>
    <div class="lamina__rejilla" style="row-gap: var(--e-6)">
      <div class="pila" style="grid-column: 1 / span 6"><p class="rotulo">Promedio por modo</p>
        ${d.por_modo.length ? barras(d.por_modo.map(m => [`${m.modo} (${m.intentos})`, m.promedio]), " %") : '<p class="texto-2">Sin intentos.</p>'}</div>
      <div class="pila" style="grid-column: 7 / -1"><p class="rotulo">Promedio por materia · de la más débil a la más fuerte</p>
        ${d.por_materia.length ? barras(d.por_materia.map(m => [`${m.materia} (${m.intentos})`, m.promedio]), " %") : '<p class="texto-2">Sin intentos.</p>'}</div>
    </div>
    <div class="pila"><p class="rotulo">Intentos recientes</p>
      ${tabla(["Fecha", "Persona", "Examen", "Modo", "#Aciertos", "#Calificación", "#Tiempo"], d.recientes.map(t => `
        <tr><td class="mono">${fecha(t.creado, true)}</td><td>${escapar(t.nombre)}</td><td>${escapar(t.titulo)}</td><td>${escapar(t.modo)}</td>
          <td class="num">${t.aciertos} / ${t.total}</td><td class="num">${n(t.puntaje)} %</td><td class="num">${t.duracion_seg ? duracion(t.duracion_seg) : "—"}</td></tr>`))}</div>`;
}

/* ───────── Guías de examen ───────── */
// Manuales y guías del examen de admisión: api/ia.php toma fragmentos de ellas al generar exámenes en Preparación.
async function guias() {
  const d = await API.get("admin.php", { seccion: "guias" });
  const areas = actual => `<option value="">General (todas las materias)</option>` +
    d.temario.map(t => `<option ${actual === t ? "selected" : ""}>${escapar(t)}</option>`).join("");
  panel.innerHTML = `
    <div class="herramientas"><p class="rotulo">${d.filas.length} ${d.filas.length === 1 ? "guía" : "guías"} · se usan al generar exámenes en Preparación</p>
      <button class="btn btn--secundario" type="button" data-subir-guia>${icono("subir", "icono--16")} Subir guía</button></div>
    <p class="texto-2">Sube manuales o guías para el examen de admisión al nivel superior. Al generar un examen de una materia se usan sus guías
      y las generales; el simulacro usa todas. Si una guía es un escaneo sin texto, la IA no puede leerla.</p>
    ${tabla(["Guía", "Materia del examen", "Tipo", "#Tamaño", "#Texto leído", "Estado", "Subida", ""], d.filas.map(g => `
      <tr data-archivo="${g.id}"><td><a href="ver.html?id=${g.id}">${escapar(g.titulo)}</a><br><small class="texto-3 mono">${escapar(g.nombre_original)}</small></td>
        <td><select class="input" data-area aria-label="Materia del examen de ${escapar(g.titulo)}">${areas(g.area_examen)}</select></td>
        <td>${(TIPOS_ARCHIVO[g.tipo] || TIPOS_ARCHIVO.otro).nombre}</td><td class="num">${tamano(g.bytes)}</td>
        <td class="num">${g.estado !== "listo" ? "—" : g.caracteres ? `${n(g.caracteres).toLocaleString("es-MX")} caracteres`
          : '<span class="chip chip--aviso" title="No se encontró texto; puede ser un escaneo">Sin texto</span>'}</td>
        <td><span class="chip ${ESTADOS_ARCHIVO[g.estado].clase}" title="${escapar(g.error || "")}">${ESTADOS_ARCHIVO[g.estado].texto}</span></td>
        <td class="mono">${fecha(g.creado, true)}</td>
        <td class="acciones"><button class="btn btn--sm btn--secundario" data-reprocesar>Reprocesar</button>
          <button class="btn btn--sm btn--peligro" data-borrar>Eliminar</button></td></tr>`), "Todavía no hay guías. Súbelas con «Subir guía».")}`;
  const recargar = () => actual === "guias" && mostrar("guias");
  Archivos.vigilar(d.filas, recargar);
  panel.addEventListener("change", async e => {
    const sel = e.target.closest("[data-area]");
    if (!sel) return;
    try { await API.post("admin.php", { id: Number(sel.closest("tr").dataset.archivo), area: sel.value }, { accion: "guia_area" }); avisar("Materia de la guía actualizada."); }
    catch (err) { avisar(err.message, "error"); recargar(); }
  });
  panel.addEventListener("click", async e => {
    if (e.target.closest("[data-subir-guia]")) return Archivos.abrir({
      seccion: "guia", rotulo: "Panel · Guías de examen", titulo: "Subir guía de examen", alTerminar: recargar,
      acepta: ".pdf,.doc,.docx,.odt,.rtf,.ppt,.pptx,.odp,.xls,.xlsx,.ods,.csv,.txt,.md", ayudaArchivo: "PDF, Word, PowerPoint, Excel o texto.",
      extras: [{ campo: "area_examen", etiqueta: "Materia del examen", vacio: "General (todas las materias)", opciones: d.temario.map(t => [t, t]),
        ayuda: "Las guías generales se usan en todos los exámenes." }]
    });
    const fila = e.target.closest("tr[data-archivo]");
    if (!fila) return;
    const id = Number(fila.dataset.archivo);
    try {
      if (e.target.closest("[data-reprocesar]")) { await API.post("archivos.php", { id }, { accion: "reprocesar" }); avisar("Guía en cola otra vez."); recargar(); }
      if (e.target.closest("[data-borrar]") && confirm("¿Eliminar la guía? Dejará de usarse al generar exámenes.")) { await API.post("archivos.php", { id }, { accion: "borrar" }); avisar("Guía eliminada."); recargar(); }
    } catch (err) { avisar(err.message, "error"); }
  });
}

/* ───────── Analítica ───────── */
async function analitica() {
  const d = await API.get("admin.php", { seccion: "analitica", dias: filtros.dias || 30 });
  panel.innerHTML = `
    <form class="form__fila" data-filtros>${campoFiltro("dias", "Periodo", [["7", "Últimos 7 días"], ["90", "Últimos 90 días"], ["365", "Último año"]], "Últimos 30 días")}</form>
    <div class="lamina__rejilla" style="row-gap: var(--e-6)">
      <div class="pila" style="grid-column: 1 / span 6"><p class="rotulo">Áreas más visitadas · visitas y tiempo promedio</p>
        ${d.secciones.length ? barras(d.secciones.map(s => [s.seccion, s.visitas, `${s.visitas} · ${duracion(s.segundos)}`])) : '<p class="texto-2">Sin visitas.</p>'}</div>
      <div class="pila" style="grid-column: 7 / -1"><p class="rotulo">Visitas por día</p>
        ${d.por_dia.length ? barras(d.por_dia.map(x => [fecha(x.dia), x.visitas])) : '<p class="texto-2">Sin visitas.</p>'}</div>
    </div>
    <div class="pila"><p class="rotulo">Páginas más visitadas</p>
      ${tabla(["Página", "#Visitas", "#Personas", "#Tiempo promedio"], d.rutas.map(r => `
        <tr><td class="mono"><a href="${escapar(r.ruta)}">${escapar(r.ruta)}</a></td><td class="num">${r.visitas}</td><td class="num">${r.personas}</td><td class="num">${duracion(r.segundos)}</td></tr>`))}</div>
    <div class="pila"><p class="rotulo">Quién pasa más tiempo en la página</p>
      ${tabla(["Persona", "Rol", "#Visitas", "#Tiempo total"], d.usuarios.map(u => `
        <tr><td>${escapar(u.nombre)}</td><td>${ROLES[u.rol]}</td><td class="num">${u.visitas}</td><td class="num">${duracion(u.segundos)}</td></tr>`))}</div>`;
}

/* ───────── Logs ───────── */
async function logs() {
  const d = await API.get("admin.php", { seccion: "logs", ...filtros });
  panel.innerHTML = `
    <form class="form__fila" data-filtros>${campoFiltro("accion", "Acción (ej. login, archivo_subir)")}${campoFiltro("q", "Persona o IP")}</form>
    ${paginacion(d)}
    ${tabla(["Fecha", "Persona", "Acción", "Objeto", "Detalle", "IP"], d.filas.map(l => `
      <tr><td class="mono">${fecha(l.fecha, true)}</td><td>${escapar(l.nombre || "Invitado")}${l.rol ? ` <small class="texto-3">${ROLES[l.rol]}</small>` : ""}</td>
        <td class="mono">${escapar(l.accion)}</td><td class="mono">${l.objeto_tipo ? `${escapar(l.objeto_tipo)} #${l.objeto_id}` : "—"}</td>
        <td class="mono" style="max-width: 22rem; overflow-wrap: anywhere">${escapar(l.detalle || "")}</td><td class="mono">${escapar(l.ip || "")}</td></tr>`), "Sin registros.")}`;
}

/* ───────── Navegación del panel ───────── */
const VISTAS = { resumen, usuarios, materias, contenido, postulaciones, cursos, examenes, guias, analitica, logs };
let actual = "resumen";

async function mostrar(id, nuevosFiltros) {
  actual = id;
  if (nuevosFiltros) filtros = nuevosFiltros;
  document.querySelectorAll("#pestanasPanel [data-vista]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.vista === id)));
  const consulta = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v)).toString();
  history.replaceState(null, "", `#${id}${consulta ? "&" + consulta : ""}`);
  const nuevo = panel.cloneNode(false); // suelta los manejadores de la vista anterior
  panel.replaceWith(nuevo);
  panel = nuevo;
  panel.innerHTML = '<p class="cargando">Cargando…</p>';
  try { await VISTAS[id](); } catch (err) { panel.innerHTML = `<div class="vacio"><p>${escapar(err.message)}</p></div>`; }
  // Filtros: se aplican al escribir (con pausa) o al cambiar un select. La paginación conserva los filtros.
  let t;
  panel.addEventListener("input", e => {
    const f = e.target.closest("[data-filtro]");
    if (!f) return;
    clearTimeout(t);
    t = setTimeout(() => { const pos = f.id; mostrar(actual, { ...filtros, [f.dataset.filtro]: f.value, pagina: "" }).then(() => document.getElementById(pos)?.focus()); }, f.tagName === "SELECT" ? 0 : 400);
  });
  panel.addEventListener("submit", e => { if (e.target.matches("[data-filtros]")) e.preventDefault(); });
  panel.addEventListener("click", e => {
    const p = e.target.closest("button[data-pagina]"); // <body data-pagina> también coincidiría
    if (p && !p.disabled) mostrar(actual, { ...filtros, pagina: p.dataset.pagina });
    const ir = e.target.closest("[data-ir]");
    if (ir) { e.preventDefault(); mostrar(ir.dataset.ir, ir.dataset.estado ? { estado: ir.dataset.estado } : {}); }
  });
}

(async () => {
  const yo = await Sesion.yo();
  if (yo.rol !== "admin") {
    document.querySelector("main").innerHTML = `<header class="cabecera-pagina"><h1 class="cabecera-pagina__titulo">Solo para admin</h1>
      <p>${yo.usuario ? "Tu cuenta no tiene acceso al panel de control." : '<a href="login.html?volver=panel.html">Inicia sesión</a> con una cuenta de admin.'}</p></header>`;
    return;
  }
  document.getElementById("pestanasPanel").innerHTML = SECCIONES.map(([id, nombre]) =>
    `<button class="chip" role="tab" type="button" data-vista="${id}" aria-selected="false">${nombre}</button>`).join("");
  document.getElementById("pestanasPanel").addEventListener("click", e => {
    const b = e.target.closest("[data-vista]");
    if (b) mostrar(b.dataset.vista, {});
  });
  const desdeHash = () => {
    const [id, ...resto] = location.hash.slice(1).split("&");
    mostrar(VISTAS[id] ? id : "resumen", Object.fromEntries(new URLSearchParams(resto.join("&"))));
  };
  desdeHash();
  addEventListener("hashchange", desdeHash);
})();
