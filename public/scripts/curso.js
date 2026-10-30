// Curso (classroom): pestañas distintas para el profesor y para el alumno.

const cursoId = Number(parametro("id"));
let panel = document.getElementById("panelCurso");
let info, yo;

const PESTANAS_PROFESOR = [["material", "Material"], ["actividades", "Actividades"], ["examenes", "Exámenes"],
  ["alumnos", "Alumnos"], ["resultados", "Resultados"], ["estadisticas", "Estadísticas"]];
const PESTANAS_ALUMNO = [["material", "Material"], ["actividades", "Actividades"], ["examenes", "Exámenes"],
  ["desempeno", "Mi desempeño"], ["evaluar", "Evaluar curso"]];

const num = v => v === null || v === undefined ? "—" : Math.round(Number(v) * 10) / 10;
const tabla = (cabeceras, filas, vacio) => filas.length
  ? `<div class="tabla-caja"><table class="tabla"><thead><tr>${cabeceras.map(c => `<th${c.startsWith("#") ? ' class="num"' : ""}>${c.replace("#", "")}</th>`).join("")}</tr></thead>
     <tbody>${filas.join("")}</tbody></table></div>`
  : `<div class="vacio"><p>${vacio}</p></div>`;
const barras = (items, max, sufijo = "") => `<ul class="barras">${items.map(([nombre, valor]) => `
  <li class="barra"><span class="barra__nombre">${escapar(nombre)}</span>
    <span class="barra__pista"><span class="barra__relleno" style="--v:${max ? (valor / max).toFixed(3) : 0}"></span></span>
    <span class="barra__valor">${num(valor)}${sufijo}</span></li>`).join("")}</ul>`;

/* ───────── Material ───────── */
async function verMaterial() {
  panel.innerHTML = `
    <div class="herramientas"><h2 class="lamina__titulo">Material</h2>
      ${info.soy_profesor ? `<button class="btn btn--secundario" type="button" id="subirMaterial">${icono("subir", "icono--16")} Subir material</button>` : ""}</div>
    <ul class="filas" id="listaMaterial"></ul>`;
  const lista = document.getElementById("listaMaterial");
  Esqueleto.poner(lista, Esqueleto.filas(3), "Cargando material…");
  const cargar = async () => {
    const { archivos } = await API.get("archivos.php", { seccion: "curso", curso_id: cursoId });
    lista.innerHTML = archivos.length ? archivos.map(Archivos.fila).join("") : `<li><span class="texto-2">El profesor todavía no sube material.</span></li>`;
    Archivos.vigilar(archivos, cargar);
  };
  Archivos.activarBorrado(lista, cargar);
  document.getElementById("subirMaterial")?.addEventListener("click", () =>
    Archivos.abrir({ seccion: "curso", curso_id: cursoId, rotulo: `Curso · ${info.curso.titulo}`, titulo: "Subir material del curso", alTerminar: cargar }));
  cargar();
}

/* ───────── Actividades ───────── */
async function verActividades() {
  const { actividades, alumnos } = await API.get("cursos.php", { id: cursoId, seccion: "actividades" });
  const ahora = new Date();
  panel.innerHTML = `
    <div class="herramientas"><h2 class="lamina__titulo">Actividades</h2></div>
    ${info.soy_profesor ? `
      <details class="acordeon"><summary>Nueva actividad</summary><div>
        <form class="form" id="formActividad">
          <div class="campo"><label for="actTitulo">Título</label><input id="actTitulo" maxlength="160" required></div>
          <div class="campo"><label for="actDesc">Instrucciones</label><textarea id="actDesc" maxlength="4000"></textarea></div>
          <div class="form__fila">
            <div class="campo"><label for="actLimite">Fecha límite</label><input type="datetime-local" id="actLimite"></div>
            <div class="campo"><label for="actPuntos">Puntos</label><input type="number" id="actPuntos" min="1" max="1000" value="10"></div>
          </div>
          <p class="form__mensaje form__mensaje--error" role="alert"></p>
          <div class="form__acciones"><button class="btn btn--primario" type="submit">Crear actividad</button></div>
        </form></div></details>` : ""}
    <div class="pila" id="listaActividades">${actividades.length ? "" : '<div class="vacio"><p>Todavía no hay actividades.</p></div>'}</div>`;

  const lista = document.getElementById("listaActividades");
  actividades.forEach((a, i) => {
    const vencida = a.fecha_limite && new Date(a.fecha_limite.replace(" ", "T")) < ahora;
    const e = a.mi_entrega;
    let estado = "";
    if (info.soy_profesor) estado = `<span class="chip">${a.entregas} / ${alumnos} entregas</span>`;
    else if (e && e.calificacion !== null) estado = `<span class="chip chip--ok">Calificada · ${num(e.calificacion)} / ${a.puntos}</span>`;
    else if (e) estado = `<span class="chip chip--ok">Entregada</span>`;
    else estado = `<span class="chip ${vencida ? "chip--error" : "chip--aviso"}">${vencida ? "Vencida" : "Pendiente"}</span>`;
    lista.insertAdjacentHTML("beforeend", `
      <article class="pieza" data-actividad="${a.id}">
        <div class="pieza__meta"><span class="rotulo">${codigo("ACT", i + 1)}</span><span class="rotulo">${a.puntos} puntos</span></div>
        <h3 class="pieza__titulo pieza__titulo--sm">${escapar(a.titulo)}</h3>
        ${a.descripcion ? `<p class="texto-2" style="white-space: pre-line">${escapar(a.descripcion)}</p>` : ""}
        <p class="pieza__datos"><span>Fecha límite: <b>${a.fecha_limite ? fecha(a.fecha_limite, true) : "sin fecha"}</b></span></p>
        ${e ? `<div class="nota"><p class="rotulo">Tu entrega · ${fecha(e.entregado, true)}</p>
            ${e.comentario_alumno ? `<p>${escapar(e.comentario_alumno)}</p>` : ""}
            ${e.archivo_id ? `<p><a href="ver.html?id=${e.archivo_id}">${escapar(e.archivo || "Archivo")}</a> <span class="chip ${ESTADOS_ARCHIVO[e.archivo_estado]?.clase || ""}">${ESTADOS_ARCHIVO[e.archivo_estado]?.texto || ""}</span></p>` : ""}
            ${e.comentario_profesor ? `<p class="rotulo">Comentario del profesor</p><p>${escapar(e.comentario_profesor)}</p>` : ""}</div>` : ""}
        <div class="pieza__pie">
          <div class="chips">${estado}</div>
          <div class="fila">
            ${info.soy_profesor
              ? `<button class="btn btn--sm btn--secundario" type="button" data-ver-entregas="${a.id}" data-puntos="${a.puntos}">Ver entregas</button>
                 <button class="btn btn--sm btn--icono btn--secundario" type="button" data-borrar-actividad="${a.id}" aria-label="Eliminar actividad">${icono("borrar", "icono--16")}</button>`
              : info.inscrito ? `<button class="btn btn--sm btn--secundario" type="button" data-subir-entrega="${a.id}">${icono("subir", "icono--16")} ${e ? "Reemplazar archivo" : "Entregar archivo"}</button>
                 <button class="btn btn--sm btn--terciario" type="button" data-entregar-texto="${a.id}">Entregar con texto</button>` : ""}
          </div>
        </div>
        <div data-entregas></div>
      </article>`);
  });

  document.getElementById("formActividad")?.addEventListener("submit", async ev => {
    ev.preventDefault();
    const f = ev.target;
    try {
      await API.post("cursos.php", { curso_id: cursoId, titulo: f.querySelector("#actTitulo").value.trim(), descripcion: f.querySelector("#actDesc").value.trim(),
        fecha_limite: f.querySelector("#actLimite").value, puntos: Number(f.querySelector("#actPuntos").value) }, { accion: "actividad_crear" });
      avisar("Actividad creada.");
      verActividades();
    } catch (err) { f.querySelector(".form__mensaje").textContent = err.message; }
  });

  lista.addEventListener("click", async ev => {
    const t = ev.target.closest("button");
    if (!t) return;
    if (t.dataset.subirEntrega) {
      Archivos.abrir({ seccion: "entrega", actividad_id: Number(t.dataset.subirEntrega), rotulo: "Entrega de actividad", titulo: "Entregar archivo", alTerminar: verActividades });
    } else if (t.dataset.entregarTexto) {
      const texto = prompt("Escribe tu entrega o un enlace a tu trabajo:");
      if (!texto) return;
      try { await API.post("cursos.php", { actividad_id: Number(t.dataset.entregarTexto), comentario: texto }, { accion: "entregar" }); avisar("Entrega registrada."); verActividades(); }
      catch (err) { avisar(err.message, "error"); }
    } else if (t.dataset.borrarActividad) {
      if (!confirm("¿Eliminar la actividad y todas sus entregas?")) return;
      await API.post("cursos.php", { id: Number(t.dataset.borrarActividad) }, { accion: "actividad_borrar" });
      verActividades();
    } else if (t.dataset.verEntregas) {
      const caja = t.closest("[data-actividad]").querySelector("[data-entregas]");
      const { entregas } = await API.get("cursos.php", { id: cursoId, seccion: "entregas", actividad_id: t.dataset.verEntregas });
      caja.innerHTML = tabla(["Alumno", "Entrega", "Estado", "Calificación", ""], entregas.map(x => `
        <tr data-entrega="${x.id || ""}">
          <td>${escapar(x.alumno)}</td>
          <td>${x.archivo_id ? `<a href="ver.html?id=${x.archivo_id}">${escapar(x.archivo)}</a>` : ""}${x.comentario_alumno ? `<br><small class="texto-2">${escapar(x.comentario_alumno)}</small>` : ""}</td>
          <td>${x.id ? `<span class="chip ${Number(x.tarde) ? "chip--aviso" : "chip--ok"}">${Number(x.tarde) ? "Tarde" : "A tiempo"}</span>` : '<span class="chip">Sin entregar</span>'}</td>
          <td>${x.id ? `<input class="input" type="number" min="0" max="${t.dataset.puntos}" step="0.5" value="${x.calificacion ?? ""}" aria-label="Calificación de ${escapar(x.alumno)}" style="width: 6rem">
              <input class="input" type="text" maxlength="2000" value="${escapar(x.comentario_profesor || "")}" placeholder="Comentario" aria-label="Comentario">` : "—"}</td>
          <td class="acciones">${x.id ? `<button class="btn btn--sm btn--secundario" type="button" data-calificar>Guardar</button>` : ""}</td>
        </tr>`), "No hay alumnos inscritos.");
      caja.addEventListener("click", async e2 => {
        if (!e2.target.closest("[data-calificar]")) return;
        const fila = e2.target.closest("tr");
        const [cal, com] = fila.querySelectorAll("input");
        try {
          await API.post("cursos.php", { entrega_id: Number(fila.dataset.entrega), calificacion: Number(cal.value), comentario: com.value }, { accion: "calificar" });
          avisar("Calificación guardada.");
        } catch (err) { avisar(err.message, "error"); }
      });
    }
  });
}

/* ───────── Exámenes ───────── */
async function verExamenes() {
  const { examenes } = await API.get("cursos.php", { id: cursoId, seccion: "examenes" });
  if (!info.soy_profesor) {
    panel.innerHTML = `<h2 class="lamina__titulo">Exámenes</h2>
      <div class="pila" id="listaExamenes">${examenes.length ? examenes.map((x, i) => `
        <article class="pieza">
          <div class="pieza__meta"><span class="rotulo">${codigo("EXA", i + 1)}</span><span class="rotulo">${x.num_preguntas} preguntas</span></div>
          <h3 class="pieza__titulo pieza__titulo--sm">${escapar(x.titulo)}</h3>
          <div class="pieza__pie">
            ${x.mi_intento ? `<span class="chip chip--ok">Resuelto · ${x.mi_intento.aciertos} / ${x.mi_intento.total} · ${Math.round(x.mi_intento.puntaje)} %</span>`
              : `<button class="btn btn--secundario btn--sm" type="button" data-resolver="${x.id}">Resolver examen</button>`}
          </div>
        </article>`).join("") : '<div class="vacio"><p>El profesor todavía no publica exámenes.</p></div>'}</div>
      <div id="resolver"></div>`;
    panel.addEventListener("click", resolverExamen);
    return;
  }

  panel.innerHTML = `
    <h2 class="lamina__titulo">Exámenes</h2>
    <details class="acordeon" open><summary>Crear examen</summary><div class="pila">
      <form class="form" id="formGenerarExamen">
        <p class="rotulo">Generar con IA · materia ${escapar(info.curso.materia)}</p>
        <div class="form__fila">
          <div class="campo"><label for="exTema">Tema</label><input id="exTema" maxlength="120" placeholder="Ej. ecuaciones de segundo grado"></div>
          <div class="campo"><label for="exCantidad">Preguntas</label><input id="exCantidad" type="number" min="3" max="20" value="8"></div>
          <div class="campo"><label for="exNivel">Dificultad</label><select id="exNivel"><option value="basico">Básica</option><option value="intermedio" selected>Intermedia</option><option value="avanzado">Avanzada</option></select></div>
        </div>
        <div class="fila"><button class="btn btn--secundario" type="submit">${icono("rayo", "icono--16")} Generar preguntas</button>
          <button class="btn btn--terciario" type="button" id="agregarManual">Agregar pregunta a mano</button></div>
      </form>
      <div id="borrador"></div>
    </div></details>
    <div class="pila"><p class="rotulo">Exámenes del curso</p>
      ${tabla(["Examen", "Origen", "#Preguntas", "#Intentos", "#Promedio", "Estado", ""], examenes.map(x => `
        <tr><td>${escapar(x.titulo)}</td><td><span class="chip">${x.origen === "ia" ? "IA" : "Manual"}</span></td>
          <td class="num">${x.num_preguntas}</td><td class="num">${x.intentos}</td><td class="num">${x.promedio ? Math.round(x.promedio) + " %" : "—"}</td>
          <td><label class="casilla"><input type="checkbox" data-publicar="${x.id}" ${Number(x.publicado) ? "checked" : ""}> Publicado</label></td>
          <td class="acciones"><button class="btn btn--sm btn--secundario" type="button" data-resolver="${x.id}">Probar</button>
            <button class="btn btn--sm btn--icono btn--secundario" type="button" data-borrar-examen="${x.id}" aria-label="Eliminar examen">${icono("borrar", "icono--16")}</button></td></tr>`),
        "Todavía no hay exámenes. Genera uno con IA o escríbelo a mano.")}
    </div>
    <div id="resolver"></div>`;

  let borrador = [];
  let origen = "manual";
  const cajaBorrador = document.getElementById("borrador");
  function pintarBorrador() {
    if (!borrador.length) { cajaBorrador.innerHTML = ""; return; }
    cajaBorrador.innerHTML = `
      <div class="pila">
        <p class="rotulo">Borrador · ${borrador.length} preguntas · revisa antes de guardar</p>
        <ol class="examen__lista">${borrador.map((p, i) => `
          <li class="pregunta"><fieldset>
            <span class="pregunta__texto">${i + 1}. ${escapar(p.pregunta)}</span>
            <ul class="pregunta__opciones" style="list-style: none; padding: 0">${p.opciones.map((o, j) => `<li class="opcion ${j === p.correcta ? "opcion--correcta" : ""}"><span class="opcion__letra">${"ABCDEF"[j]}</span>${escapar(o)}</li>`).join("")}</ul>
            ${p.explicacion ? `<p class="texto-2">${escapar(p.explicacion)}</p>` : ""}
            <div><button class="btn btn--sm btn--secundario" type="button" data-quitar="${i}">Quitar pregunta</button></div>
          </fieldset></li>`).join("")}</ol>
        <form class="form" id="formGuardarExamen">
          <div class="form__fila">
            <div class="campo"><label for="exTitulo">Título del examen</label><input id="exTitulo" maxlength="200" required value="Examen de ${escapar(info.curso.materia)}"></div>
            <label class="casilla"><input type="checkbox" id="exPublicar" checked> Publicar para los alumnos</label>
          </div>
          <div class="form__acciones"><button class="btn btn--primario" type="submit">Guardar examen</button></div>
        </form>
      </div>`;
  }
  cajaBorrador.addEventListener("click", e => {
    const q = e.target.closest("[data-quitar]");
    if (q) { borrador.splice(Number(q.dataset.quitar), 1); pintarBorrador(); }
  });
  cajaBorrador.addEventListener("submit", async e => {
    e.preventDefault();
    try {
      await API.post("cursos.php", { curso_id: cursoId, titulo: document.getElementById("exTitulo").value.trim(), preguntas: borrador, origen,
        publicado: document.getElementById("exPublicar").checked }, { accion: "examen_guardar" });
      avisar("Examen guardado.");
      verExamenes();
    } catch (err) { avisar(err.message, "error"); }
  });

  document.getElementById("formGenerarExamen").addEventListener("submit", async e => {
    e.preventDefault();
    const boton = e.target.querySelector('[type="submit"]');
    const r = await ocupado(boton, () => Examen.generar({ modo: "materia", materia: info.curso.materia, tema: document.getElementById("exTema").value.trim(),
      cantidad: Number(document.getElementById("exCantidad").value), nivel: document.getElementById("exNivel").value, variante: Date.now() % 20 + 1 }));
    if (r.aviso) avisar(`Sin IA: ${r.aviso}`, "error");
    origen = r.origen === "ia" ? "ia" : origen;
    borrador = borrador.concat(r.datos.preguntas || []);
    pintarBorrador();
  });

  document.getElementById("agregarManual").addEventListener("click", () => {
    const pregunta = prompt("Escribe la pregunta:");
    if (!pregunta) return;
    const opciones = [];
    for (const letra of "ABCD") {
      const o = prompt(`Opción ${letra} (deja vacío para terminar):`);
      if (!o) break;
      opciones.push(o);
    }
    if (opciones.length < 2) { avisar("Una pregunta necesita al menos 2 opciones.", "error"); return; }
    const letra = (prompt(`¿Cuál es la correcta? (${"ABCD".slice(0, opciones.length).split("").join(", ")})`) || "").trim().toUpperCase();
    const correcta = "ABCD".indexOf(letra);
    if (correcta < 0 || correcta >= opciones.length) { avisar("Marca la respuesta correcta con su letra.", "error"); return; }
    borrador.push({ pregunta, opciones, correcta, explicacion: prompt("Explicación (opcional):") || "" });
    pintarBorrador();
  });

  panel.addEventListener("change", async e => {
    const c = e.target.closest("[data-publicar]");
    if (!c) return;
    await API.post("cursos.php", { id: Number(c.dataset.publicar), publicado: c.checked }, { accion: "examen_publicar" });
    avisar(c.checked ? "Examen publicado." : "Examen oculto para los alumnos.");
  });
  panel.addEventListener("click", async e => {
    const b = e.target.closest("[data-borrar-examen]");
    if (b && confirm("¿Eliminar el examen? Los intentos de los alumnos se conservan sin el examen.")) {
      await API.post("cursos.php", { id: Number(b.dataset.borrarExamen) }, { accion: "examen_borrar" });
      verExamenes();
    }
    resolverExamen(e);
  });
}

async function resolverExamen(e) {
  const b = e.target.closest("[data-resolver]");
  if (!b) return;
  const { examen } = await API.get("cursos.php", { id: cursoId, seccion: "examen", examen_id: b.dataset.resolver });
  const caja = document.getElementById("resolver");
  caja.innerHTML = `<h3 class="lamina__titulo" style="margin-top: var(--e-6)">${escapar(examen.titulo)}</h3><div id="contenedorExamen"></div>`;
  Examen.pintar(document.getElementById("contenedorExamen"), { preguntas: examen.preguntas }, {
    modo: "curso", titulo: examen.titulo,
    calificar: (respuestas, duracion) => API.post("cursos.php", { examen_id: examen.id, respuestas, duracion }, { accion: "examen_responder" })
  });
  caja.scrollIntoView({ behavior: "smooth" });
}

/* ───────── Profesor: alumnos, resultados, estadísticas ───────── */
async function verAlumnos() {
  const { alumnos, actividades } = await API.get("cursos.php", { id: cursoId, seccion: "alumnos" });
  panel.innerHTML = `<h2 class="lamina__titulo">Alumnos</h2>
    ${tabla(["Alumno", "Correo", "Inscrito", "#Entregas", "#Prom. actividades", "#Prom. exámenes", ""], alumnos.map(a => `
      <tr><td>${escapar(a.nombre)}</td><td class="mono">${escapar(a.email)}</td><td class="mono">${fecha(a.inscrito)}</td>
        <td class="num">${a.entregas} / ${actividades}</td><td class="num">${num(a.promedio_actividades)}</td>
        <td class="num">${a.promedio_examenes ? Math.round(a.promedio_examenes) + " %" : "—"}</td>
        <td class="acciones"><button class="btn btn--sm btn--peligro" type="button" data-quitar-alumno="${a.id}">Quitar</button></td></tr>`),
      "Todavía no hay alumnos inscritos. Comparte el enlace de esta página para que se inscriban.")}`;
  panel.querySelectorAll("[data-quitar-alumno]").forEach(b => b.addEventListener("click", async () => {
    if (!confirm("¿Quitar a este alumno del curso?")) return;
    await API.post("cursos.php", { curso_id: cursoId, alumno_id: Number(b.dataset.quitarAlumno) }, { accion: "quitar_alumno" });
    verAlumnos();
  }));
}

async function verResultados() {
  const { resultados } = await API.get("cursos.php", { id: cursoId, seccion: "resultados" });
  panel.innerHTML = `<h2 class="lamina__titulo">Resultados</h2>
    ${tabla(["Fecha", "Alumno", "Examen", "#Aciertos", "#Calificación", "#Tiempo"], resultados.map(r => `
      <tr><td class="mono">${fecha(r.creado, true)}</td><td>${escapar(r.alumno)}</td><td>${escapar(r.examen)}</td>
        <td class="num">${r.aciertos} / ${r.total}</td><td class="num">${Math.round(r.puntaje)} %</td><td class="num">${r.duracion_seg ? duracion(r.duracion_seg) : "—"}</td></tr>`),
      "Todavía nadie resuelve los exámenes del curso.")}`;
}

async function verEstadisticas() {
  const s = await API.get("cursos.php", { id: cursoId, seccion: "estadisticas" });
  const promEval = s.evaluaciones.length ? s.evaluaciones.reduce((t, e) => t + (Number(e.estrellas_curso) + Number(e.estrellas_profesor)) / 2, 0) / s.evaluaciones.length : null;
  const aTiempo = Number(s.entregas.total) ? Math.round(Number(s.entregas.a_tiempo) * 100 / Number(s.entregas.total)) : null;
  const maxMat = Math.max(1, ...s.material.map(m => Number(m.visitas)));
  const maxDia = Math.max(1, ...s.por_dia.map(d => Number(d.visitas)));
  panel.innerHTML = `
    <h2 class="lamina__titulo">Estadísticas</h2>
    <div class="kpis">
      <div class="kpi"><span class="rotulo">Visitas al curso</span><span class="kpi__valor">${s.visitas.total}</span><span class="kpi__nota">${s.visitas.personas} personas con cuenta</span></div>
      <div class="kpi"><span class="rotulo">Tiempo promedio</span><span class="kpi__valor">${duracion(s.visitas.segundos)}</span></div>
      <div class="kpi"><span class="rotulo">Entregas a tiempo</span><span class="kpi__valor">${aTiempo === null ? "—" : aTiempo + " %"}</span><span class="kpi__nota">${s.entregas.total} entregas</span></div>
      <div class="kpi"><span class="rotulo">Evaluación</span><span class="kpi__valor">${promEval ? promEval.toFixed(1) : "—"}</span><span class="kpi__nota">${s.evaluaciones.length} opiniones</span></div>
    </div>
    <div class="pila"><p class="rotulo">Visitas por día · últimos 30 días</p>
      ${s.por_dia.length ? barras(s.por_dia.map(d => [fecha(d.dia), Number(d.visitas)]), maxDia) : '<p class="texto-2">Sin visitas en este periodo.</p>'}</div>
    <div class="pila"><p class="rotulo">Material más visto</p>
      ${s.material.length ? barras(s.material.map(m => [m.titulo, Number(m.visitas)]), maxMat) : '<p class="texto-2">Todavía no hay material.</p>'}</div>
    <div class="pila"><p class="rotulo">Promedio por examen</p>
      ${s.examenes.length ? barras(s.examenes.map(x => [x.titulo, Number(x.promedio || 0)]), 100, " %") : '<p class="texto-2">Todavía no hay exámenes.</p>'}</div>
    <div class="pila"><p class="rotulo">Opiniones de los alumnos</p>
      ${s.evaluaciones.length ? `<ul class="filas">${s.evaluaciones.map(e => `<li><div class="filas__principal">
          <span class="filas__meta">Curso ${estrellas(e.estrellas_curso)} · Profesor ${estrellas(e.estrellas_profesor)} · ${fecha(e.creado)}</span>
          <span>${escapar(e.comentario || "Sin comentario")}</span></div></li>`).join("")}</ul>` : '<p class="texto-2">Todavía nadie evalúa el curso.</p>'}</div>`;
}

/* ───────── Alumno: desempeño y evaluación ───────── */
async function verDesempeno() {
  const d = await API.get("cursos.php", { id: cursoId, seccion: "desempeno" });
  const calificadas = d.actividades.filter(a => a.calificacion !== null);
  const pctAct = calificadas.length ? calificadas.reduce((t, a) => t + a.calificacion * 100 / a.puntos, 0) / calificadas.length : null;
  const hechos = d.examenes.filter(x => x.puntaje !== null);
  const pctEx = hechos.length ? hechos.reduce((t, x) => t + Number(x.puntaje), 0) / hechos.length : null;
  panel.innerHTML = `
    <h2 class="lamina__titulo">Mi desempeño</h2>
    <div class="kpis">
      <div class="kpi"><span class="rotulo">Actividades</span><span class="kpi__valor">${pctAct === null ? "—" : Math.round(pctAct) + " %"}</span><span class="kpi__nota">${calificadas.length} de ${d.actividades.length} calificadas</span></div>
      <div class="kpi"><span class="rotulo">Exámenes</span><span class="kpi__valor">${pctEx === null ? "—" : Math.round(pctEx) + " %"}</span><span class="kpi__nota">Grupo: ${d.grupo.promedio_examenes ? Math.round(d.grupo.promedio_examenes) + " %" : "—"}</span></div>
    </div>
    <div class="pila"><p class="rotulo">Actividades</p>
      ${tabla(["Actividad", "Entregada", "#Calificación", "Comentario"], d.actividades.map(a => `
        <tr><td>${escapar(a.titulo)}</td><td class="mono">${a.entregado ? fecha(a.entregado, true) : "—"}</td>
          <td class="num">${a.calificacion !== null ? `${num(a.calificacion)} / ${a.puntos}` : "—"}</td><td>${escapar(a.comentario_profesor || "")}</td></tr>`), "No hay actividades.")}</div>
    <div class="pila"><p class="rotulo">Exámenes</p>
      ${tabla(["Examen", "#Aciertos", "#Calificación"], d.examenes.map(x => `
        <tr><td>${escapar(x.titulo)}</td><td class="num">${x.total ? `${x.aciertos} / ${x.total}` : "Pendiente"}</td>
          <td class="num">${x.puntaje !== null ? Math.round(x.puntaje) + " %" : "—"}</td></tr>`), "No hay exámenes publicados.")}</div>`;
}

function verEvaluar() {
  const ya = info.mi_evaluacion;
  if (ya) {
    panel.innerHTML = `<h2 class="lamina__titulo">Evaluar curso</h2>
      <div class="nota nota--ok"><p class="rotulo">Ya evaluaste este curso</p>
        <p>Curso ${estrellas(ya.estrellas_curso)} · Profesor ${estrellas(ya.estrellas_profesor)}</p>
        ${ya.comentario ? `<p>${escapar(ya.comentario)}</p>` : ""}</div>`;
    return;
  }
  const entrada = nombre => `<div class="estrellas estrellas--entrada" role="radiogroup">${[5, 4, 3, 2, 1].map(n => `
      <input type="radio" name="${nombre}" id="${nombre}${n}" value="${n}" required><label for="${nombre}${n}" aria-label="${n} estrellas">
      <svg class="icono estrella-llena" viewBox="0 0 24 24" aria-hidden="true">${ICONOS.estrella}</svg></label>`).join("")}</div>`;
  panel.innerHTML = `<h2 class="lamina__titulo">Evaluar curso</h2>
    <form class="form lectura" id="formEvaluar">
      <fieldset class="campo" style="border: 0; padding: 0"><legend class="campo__etiqueta">El curso</legend>${entrada("ec")}</fieldset>
      <fieldset class="campo" style="border: 0; padding: 0"><legend class="campo__etiqueta">El profesor · ${escapar(info.curso.profesor)}</legend>${entrada("ep")}</fieldset>
      <div class="campo"><label for="evComentario">Comentario (opcional)</label><textarea id="evComentario" maxlength="2000" placeholder="¿Qué te ayudó? ¿Qué mejorarías?"></textarea></div>
      <p class="form__mensaje form__mensaje--error" role="alert"></p>
      <div class="form__acciones" style="justify-content: flex-start"><button class="btn btn--primario" type="submit">Enviar evaluación</button></div>
    </form>`;
  document.getElementById("formEvaluar").addEventListener("submit", async e => {
    e.preventDefault();
    const f = e.target;
    const ec = f.querySelector("[name=ec]:checked"), ep = f.querySelector("[name=ep]:checked");
    if (!ec || !ep) { f.querySelector(".form__mensaje").textContent = "Elige de 1 a 5 estrellas para el curso y para el profesor."; return; }
    try {
      await API.post("cursos.php", { curso_id: cursoId, estrellas_curso: Number(ec.value), estrellas_profesor: Number(ep.value),
        comentario: f.querySelector("#evComentario").value.trim() }, { accion: "evaluar" });
      avisar("Gracias por tu evaluación.");
      info = await API.get("cursos.php", { id: cursoId });
      verEvaluar();
    } catch (err) { f.querySelector(".form__mensaje").textContent = err.message; }
  });
}

/* ───────── Inicio ───────── */
const VISTAS = { material: verMaterial, actividades: verActividades, examenes: verExamenes, alumnos: verAlumnos,
  resultados: verResultados, estadisticas: verEstadisticas, desempeno: verDesempeno, evaluar: verEvaluar };

// Forma de cada vista mientras carga (Evaluar es un formulario corto: se queda con el texto).
const esqueletoLista = () => `${Esqueleto.herramientas()}<ul class="filas">${Esqueleto.filas(4)}</ul>`;
const ESQUELETOS = { material: esqueletoLista, actividades: esqueletoLista, examenes: esqueletoLista,
  alumnos: () => Esqueleto.herramientas() + Esqueleto.tabla(6), resultados: () => Esqueleto.herramientas() + Esqueleto.tabla(6),
  estadisticas: () => Esqueleto.kpis(4) + Esqueleto.tabla(4), desempeno: () => Esqueleto.kpis(3) + Esqueleto.tabla(3) };

async function mostrar(id) {
  document.querySelectorAll("#pestanasCurso [data-vista]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.vista === id)));
  history.replaceState(null, "", `#${id}`);
  // Se reemplaza el panel para soltar los manejadores de la vista anterior.
  const nuevo = panel.cloneNode(false);
  panel.replaceWith(nuevo);
  panel = nuevo;
  const forma = ESQUELETOS[id]?.();
  if (forma) Esqueleto.poner(nuevo, forma, "Cargando…");
  else nuevo.innerHTML = '<p class="cargando">Cargando…</p>';
  try { await VISTAS[id](); } catch (err) { nuevo.innerHTML = `<div class="vacio"><p>${escapar(err.message)}</p></div>`; }
  Animar.registrar(nuevo);
}

Esqueleto.poner(document.getElementById("encabezado"), Esqueleto.encabezado(), "Cargando curso…");
(async () => {
  yo = await Sesion.yo();
  try { info = await API.get("cursos.php", { id: cursoId }); }
  catch {
    document.getElementById("encabezado").innerHTML = `<h1 class="cabecera-pagina__titulo">Curso no encontrado</h1><p><a href="index.html#apoyo">Volver a Apoyo</a></p>`;
    return;
  }
  const c = info.curso;
  document.title = `${c.titulo} · Bátiz hasta la muerte`;
  document.getElementById("encabezado").innerHTML = `
    <nav class="migas" aria-label="Ruta"><a href="index.html#apoyo">Lámina 02 · Apoyo</a><span>/</span>
      <a href="materia.html?m=${encodeURIComponent(c.materia_slug)}#cursos">${escapar(c.materia)}</a><span>/</span><span>Curso</span></nav>
    <p class="rotulo">Curso ${String(c.id).padStart(3, "0")} · Profesor <b>${escapar(c.profesor)}</b></p>
    <h1 class="cabecera-pagina__titulo">${escapar(c.titulo)}</h1>
    ${cota(c.alumnos, c.alumnos === 1 ? "alumno" : "alumnos")}
    ${c.descripcion ? `<p class="lamina__lead" style="white-space: pre-line">${escapar(c.descripcion)}</p>` : ""}
    <div class="fila">${c.calificacion ? estrellas(c.calificacion) : ""}
      ${info.inscrito ? `<span class="chip chip--ok">Inscrito</span><button class="btn btn--terciario btn--sm" type="button" id="darmeBaja">Darme de baja</button>` : ""}</div>`;
  Animar.registrar();

  if (!info.soy_profesor && !info.inscrito) {
    document.getElementById("pestanasCurso").hidden = true;
    panel.innerHTML = yo.rol === "alumno"
      ? `<div class="vacio"><p>Inscríbete para ver el material, entregar actividades y resolver exámenes.</p>
          <button class="btn btn--primario" type="button" id="inscribirme">Inscribirme al curso</button></div>`
      : `<div class="vacio"><p>${yo.usuario ? "Solo los alumnos se pueden inscribir a los cursos." : "Inicia sesión como alumno para inscribirte a este curso."}</p>
          ${yo.usuario ? "" : `<a class="btn btn--secundario" href="login.html?volver=curso.html?id=${cursoId}">Iniciar sesión</a>`}</div>`;
    document.getElementById("inscribirme")?.addEventListener("click", async () => {
      try { await API.post("cursos.php", { curso_id: cursoId }, { accion: "inscribir" }); location.reload(); }
      catch (err) { avisar(err.message, "error"); }
    });
    return;
  }

  document.getElementById("darmeBaja")?.addEventListener("click", async () => {
    if (!confirm("¿Darte de baja del curso? Tus entregas se conservan.")) return;
    await API.post("cursos.php", { curso_id: cursoId }, { accion: "baja" });
    location.href = "cursos.html";
  });

  const pestanas = info.soy_profesor ? PESTANAS_PROFESOR : PESTANAS_ALUMNO;
  document.getElementById("pestanasCurso").innerHTML = pestanas.map(([id, nombre]) =>
    `<button class="chip" role="tab" type="button" data-vista="${id}" aria-selected="false">${nombre}</button>`).join("");
  document.getElementById("pestanasCurso").addEventListener("click", e => {
    const b = e.target.closest("[data-vista]");
    if (b) mostrar(b.dataset.vista);
  });
  const inicial = location.hash.slice(1);
  mostrar(pestanas.some(([id]) => id === inicial) ? inicial : "material");
  // Enlaces con #pestaña y los botones Atrás/Adelante cambian de pestaña.
  addEventListener("hashchange", () => {
    const id = location.hash.slice(1);
    if (pestanas.some(([p]) => p === id)) mostrar(id);
  });
})();
