// Subida de archivos y su representación como piezas o filas. Lo usan todas las secciones.

const Archivos = (() => {
  const PREFIJOS = { apuntes: "EST", tareas: "EST", examenes: "EST", apoyo: "APO", curso: "CUR", entrega: "ENT" };
  const ACEPTA = ".pdf,.doc,.docx,.odt,.rtf,.ppt,.pptx,.odp,.xls,.xlsx,.ods,.csv,.txt,.md,.py,.js,.java,.c,.cpp,.html,.css,.json,.sql," +
    ".png,.jpg,.jpeg,.gif,.webp,.bmp,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus,.mp4,.webm,.mov,.mkv,.avi,.m4v,.zip";

  function estado(a) {
    const e = ESTADOS_ARCHIVO[a.estado] || ESTADOS_ARCHIVO.pendiente;
    return `<span class="chip ${e.clase}" data-estado="${escapar(a.estado)}">${e.texto}</span>`;
  }

  // Tarjeta de pieza para rejillas (design.md §7.4).
  function pieza(a, n) {
    const tipo = TIPOS_ARCHIVO[a.tipo] || TIPOS_ARCHIVO.otro;
    const prefijo = PREFIJOS[a.seccion] || "EST";
    const enlace = a.estado === "listo"
      ? `<a class="pieza__enlace pieza__enlace--cubre" href="ver.html?id=${a.id}">Abrir <span class="flecha">${icono("flecha", "icono--16")}</span></a>`
      : `<span class="rotulo">${a.estado === "error" ? "No se pudo procesar" : "Generando vista…"}</span>`;
    return `
      <article class="pieza" data-archivo="${a.id}">
        <div class="pieza__meta"><span class="rotulo">${codigo(prefijo, n)}</span><span class="rotulo">${escapar(a.materia || "General")}</span></div>
        <div class="fila" style="gap: var(--e-2); color: var(--sec)">${icono(tipo.icono)}<span class="rotulo">${tipo.nombre} · ${tamano(a.bytes)}</span></div>
        <h3 class="pieza__titulo pieza__titulo--sm">${escapar(a.titulo)}</h3>
        ${a.resumen ? `<p class="pieza__texto">${escapar(a.resumen)}</p>` : ""}
        <p class="pieza__datos"><span>${escapar(a.autor || "Anónimo")}</span><span>${fecha(a.creado)}</span></p>
        <div class="pieza__pie">
          <div class="chips">${estado(a)}</div>
          ${a.puede_borrar ? `<div class="pieza__acciones"><button class="btn btn--sm btn--icono btn--secundario" type="button" data-borrar-archivo="${a.id}" aria-label="Eliminar ${escapar(a.titulo)}">${icono("borrar", "icono--16")}</button></div>` : ""}
          ${enlace}
        </div>
      </article>`;
  }

  // Fila compacta para listas (material de materia, curso, entregas).
  function fila(a) {
    const tipo = TIPOS_ARCHIVO[a.tipo] || TIPOS_ARCHIVO.otro;
    return `
      <li data-archivo="${a.id}">
        <span style="color: var(--sec)">${icono(tipo.icono)}</span>
        <div class="filas__principal">
          <span class="filas__titulo">${escapar(a.titulo)}</span>
          <span class="filas__meta">${tipo.nombre} · ${tamano(a.bytes)} · ${escapar(a.autor || "Anónimo")} · ${fecha(a.creado)}</span>
        </div>
        ${estado(a)}
        ${a.estado === "listo" ? `<a class="btn btn--sm btn--secundario" href="ver.html?id=${a.id}">Abrir</a>` : ""}
        ${a.puede_borrar ? `<button class="btn btn--sm btn--icono btn--secundario" type="button" data-borrar-archivo="${a.id}" aria-label="Eliminar ${escapar(a.titulo)}">${icono("borrar", "icono--16")}</button>` : ""}
      </li>`;
  }

  // Delegación de «Eliminar» en un contenedor.
  function activarBorrado(contenedor, alBorrar) {
    contenedor.addEventListener("click", async e => {
      const boton = e.target.closest("[data-borrar-archivo]");
      if (!boton) return;
      const titulo = boton.closest("[data-archivo]").querySelector(".pieza__titulo, .filas__titulo")?.textContent || "este archivo";
      if (!confirm(`¿Eliminar «${titulo}»? Se borran el original y su vista.`)) return;
      try {
        await API.post("archivos.php", { id: Number(boton.dataset.borrarArchivo) }, { accion: "borrar" });
        avisar("Archivo eliminado.");
        alBorrar && alBorrar();
      } catch (err) { avisar(err.message, "error"); }
    });
  }

  // Mientras haya archivos en cola, vuelve a consultar cada 5 s.
  function vigilar(lista, recargar) {
    clearTimeout(vigilar.t);
    if (lista.some(a => a.estado === "pendiente" || a.estado === "procesando")) vigilar.t = setTimeout(recargar, 5000);
  }

  // Diálogo de subida. opciones: { seccion, materia_id, curso_id, actividad_id, materias, titulo, alTerminar, acepta, ayudaArchivo,
  //   extras: [{ campo, etiqueta, opciones: [[valor, texto]], vacio, ayuda }] } — selects adicionales que se envían tal cual.
  function abrir(opciones) {
    const dialogo = document.createElement("dialog");
    dialogo.className = "modal";
    const conMateria = opciones.materias && !opciones.materia_id;
    dialogo.innerHTML = `
      <form class="modal__cuerpo form" novalidate>
        <p class="rotulo">${escapar(opciones.rotulo || "Subir archivo")}</p>
        <h2 class="modal__titulo">${escapar(opciones.titulo || "Subir archivo")}</h2>
        <div class="campo">
          <label for="subirArchivo">Archivo(s)</label>
          <input type="file" id="subirArchivo" name="archivo" accept="${opciones.acepta || ACEPTA}" multiple required>
          <span class="campo__ayuda">${escapar(opciones.ayudaArchivo || "PDF, Word, PowerPoint, Excel, texto, imagen, audio o video.")} Máximo 200 MB por archivo.</span>
        </div>
        <div class="campo">
          <label for="subirTitulo">Título (opcional)</label>
          <input type="text" id="subirTitulo" maxlength="200" placeholder="Si lo dejas vacío se usa el nombre del archivo">
        </div>
        ${conMateria ? `<div class="campo">
          <label for="subirMateria">Materia</label>
          <select id="subirMateria"><option value="">General (sin materia)</option>
            ${opcionesMaterias(opciones.materias)}</select>
        </div>` : ""}
        ${(opciones.extras || []).map(x => `<div class="campo">
          <label for="subirExtra_${x.campo}">${escapar(x.etiqueta)}</label>
          <select id="subirExtra_${x.campo}" data-extra="${x.campo}">${x.vacio ? `<option value="">${escapar(x.vacio)}</option>` : ""}
            ${x.opciones.map(([v, t]) => `<option value="${escapar(v)}">${escapar(t)}</option>`).join("")}</select>
          ${x.ayuda ? `<span class="campo__ayuda">${escapar(x.ayuda)}</span>` : ""}
        </div>`).join("")}
        <p class="form__mensaje" role="status" aria-live="polite"></p>
        <div class="form__acciones">
          <button type="button" class="btn btn--secundario" data-cancelar>Cancelar</button>
          <button type="submit" class="btn btn--primario">${icono("subir", "icono--16")} Subir</button>
        </div>
      </form>`;
    document.body.append(dialogo);
    const form = dialogo.querySelector("form");
    const mensaje = form.querySelector(".form__mensaje");
    dialogo.querySelector("[data-cancelar]").addEventListener("click", () => dialogo.close());
    dialogo.addEventListener("close", () => dialogo.remove());

    form.addEventListener("submit", async e => {
      e.preventDefault();
      const archivos = form.querySelector("#subirArchivo").files;
      if (!archivos.length) {
        mensaje.className = "form__mensaje form__mensaje--error";
        mensaje.textContent = "Elige al menos un archivo para subir.";
        return;
      }
      const boton = form.querySelector('[type="submit"]');
      boton.disabled = true;
      boton.setAttribute("aria-busy", "true");
      const titulo = form.querySelector("#subirTitulo").value.trim();
      const materia = conMateria ? form.querySelector("#subirMateria").value : opciones.materia_id;
      let subidos = 0;
      try {
        for (const archivo of archivos) {
          const datos = new FormData();
          datos.append("archivo", archivo);
          datos.append("seccion", opciones.seccion);
          if (titulo) datos.append("titulo", archivos.length > 1 ? `${titulo} (${subidos + 1})` : titulo);
          if (materia) datos.append("materia_id", materia);
          if (opciones.curso_id) datos.append("curso_id", opciones.curso_id);
          if (opciones.actividad_id) datos.append("actividad_id", opciones.actividad_id);
          form.querySelectorAll("[data-extra]").forEach(s => s.value && datos.append(s.dataset.extra, s.value));
          await API.subir("subir.php", datos, p => {
            mensaje.className = "form__mensaje";
            mensaje.textContent = `Subiendo ${archivo.name}: ${Math.round(p * 100)} %`;
          });
          subidos++;
        }
        avisar(subidos === 1 ? "Archivo subido. Estamos generando su vista." : `${subidos} archivos subidos. Estamos generando sus vistas.`);
        dialogo.close();
        opciones.alTerminar && opciones.alTerminar();
      } catch (err) {
        mensaje.className = "form__mensaje form__mensaje--error";
        mensaje.textContent = err.message;
        boton.disabled = false;
        boton.removeAttribute("aria-busy");
        if (subidos) opciones.alTerminar && opciones.alTerminar();
      }
    });
    dialogo.showModal();
  }

  return { pieza, fila, abrir, activarBorrado, vigilar };
})();
