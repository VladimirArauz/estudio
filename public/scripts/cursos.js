// Mis cursos: los que imparto (profesor) o en los que estoy inscrito (alumno).

const ESTADOS_POSTULACION = { pendiente: "chip--aviso", aprobada: "chip--ok", rechazada: "chip--error" };

(async () => {
  const yo = await Sesion.yo();
  if (!yo.usuario) { location.href = "login.html?volver=cursos.html"; return; }
  const lista = document.getElementById("listaCursos");
  let datos;
  try { datos = await API.get("cursos.php", { mios: 1, todos: yo.rol === "admin" ? 1 : "" }); }
  catch (err) { lista.innerHTML = `<div class="vacio"><p>${escapar(err.message)}</p></div>`; return; }

  const esAlumno = yo.rol === "alumno";
  document.getElementById("rotuloCursos").textContent = esAlumno ? "Cursos en los que estás inscrito" : yo.rol === "admin" ? "Todos los cursos" : "Cursos que impartes";
  document.getElementById("leadCursos").textContent = esAlumno
    ? "Entra a un curso para ver su material, entregar actividades y resolver exámenes."
    : "Administra el material, las actividades, los exámenes y a tus alumnos.";
  document.getElementById("cotaCursos").innerHTML = cota(datos.cursos.length, datos.cursos.length === 1 ? "curso" : "cursos");
  Animar.registrar();

  lista.innerHTML = datos.cursos.length ? datos.cursos.map((c, i) => `
    <article class="pieza">
      <div class="pieza__meta"><span class="rotulo">${codigo("CUR", i + 1)}</span><span class="rotulo">${escapar(c.materia)}</span></div>
      <h2 class="pieza__titulo pieza__titulo--sm">${escapar(c.titulo)}</h2>
      ${c.descripcion ? `<p class="pieza__texto">${escapar(c.descripcion)}</p>` : ""}
      <p class="pieza__datos"><span>Profesor: <b>${escapar(c.profesor)}</b></span><span>Alumnos: <b>${c.alumnos}</b></span>
        ${c.visitas !== undefined ? `<span>Visitas: <b>${c.visitas}</b></span>` : ""}</p>
      <div class="pieza__pie">
        <div class="chips">${c.calificacion ? estrellas(c.calificacion) : '<span class="chip">Sin evaluar</span>'}${c.estado === "archivado" ? '<span class="chip">Archivado</span>' : ""}</div>
        <a class="pieza__enlace pieza__enlace--cubre" href="curso.html?id=${c.id}">Abrir curso <span class="flecha">${icono("flecha", "icono--16")}</span></a>
      </div>
    </article>`).join("")
    : `<div class="vacio"><p>${esAlumno ? "Todavía no estás inscrito a ningún curso." : "Todavía no tienes cursos."}</p>
        <a class="btn btn--secundario" href="index.html#apoyo">${esAlumno ? "Buscar cursos por materia" : "Postularme en una materia"}</a></div>`;

  if (!esAlumno && datos.cursos.length) {
    const max = Math.max(1, ...datos.cursos.map(c => c.visitas));
    document.getElementById("seccionVisitas").hidden = false;
    document.getElementById("barrasVisitas").innerHTML = [...datos.cursos].sort((a, b) => b.visitas - a.visitas).map(c => `
      <li class="barra"><span class="barra__nombre">${escapar(c.titulo)}</span>
        <span class="barra__pista"><span class="barra__relleno" style="--v:${(c.visitas / max).toFixed(3)}"></span></span>
        <span class="barra__valor">${c.visitas}</span></li>`).join("");
  }
  if (datos.postulaciones.length) {
    document.getElementById("seccionPostulaciones").hidden = false;
    document.getElementById("tablaPostulaciones").innerHTML = datos.postulaciones.map(p => `
      <tr><td><a href="materia.html?m=${encodeURIComponent(p.slug)}#cursos">${escapar(p.materia)}</a></td>
        <td><span class="chip ${ESTADOS_POSTULACION[p.estado]}">${p.estado}</span></td><td class="mono">${fecha(p.creado)}</td></tr>`).join("");
  }
})();
