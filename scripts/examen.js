// Generar, resolver y calificar exámenes. Lo usan preparacion.html y curso.html.

const Examen = (() => {
  const LETRAS = ["A", "B", "C", "D", "E", "F"];
  const SEG_POR_PREGUNTA_QUIZ = 30;

  // Pide el examen a la IA y, si no está disponible, usa el banco local.
  async function generar(opciones) {
    try {
      const r = await API.post("ia.php", opciones, { accion: "generar" });
      if (r.ok) return { datos: r.datos, origen: "ia", cache: r.cached };
      return { datos: generarLocal(opciones), origen: "local", aviso: r.error };
    } catch (err) {
      return { datos: generarLocal(opciones), origen: "local", aviso: err.message };
    }
  }

  function resultado(contenedor, aciertos, total, segundos) {
    const pct = total ? Math.round(aciertos * 100 / total) : 0;
    const mensaje = pct >= 80 ? "Excelente. Sube la dificultad o cambia de tema." : pct >= 60 ? "Vas bien. Repasa las explicaciones de lo que fallaste." : "Repasa este tema y vuelve a intentarlo.";
    contenedor.insertAdjacentHTML("afterbegin", `
      <section class="pila resultado" aria-live="polite">
        <div class="kpis">
          <div class="kpi"><span class="rotulo">Aciertos</span><span class="kpi__valor">${aciertos} / ${total}</span></div>
          <div class="kpi"><span class="rotulo">Calificación</span><span class="kpi__valor">${pct} %</span></div>
          ${segundos != null ? `<div class="kpi"><span class="rotulo">Tiempo</span><span class="kpi__valor">${duracion(segundos)}</span></div>` : ""}
        </div>
        <div class="nota ${pct >= 60 ? "nota--ok" : "nota--aviso"}"><p class="rotulo">Resultado</p><p>${mensaje}</p></div>
      </section>`);
    contenedor.querySelector(".resultado").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function guardar(meta, aciertos, total, segundos, detalle) {
    const yo = await Sesion.yo();
    if (!yo.usuario) return "invitado";
    try {
      await API.post("ia.php", { modo: meta.modo, materia: meta.materia, titulo: meta.titulo, examen_id: meta.examen_id,
        aciertos, total, duracion: segundos, detalle }, { accion: "guardar_intento" });
      return "guardado";
    } catch (err) {
      avisar(err.message, "error");
      return "error";
    }
  }

  function notaGuardado(contenedor, estado) {
    if (estado === "invitado") contenedor.insertAdjacentHTML("afterbegin", `<p class="nota"><span class="rotulo">Nota</span>
      <span><a href="login.html?volver=preparacion.html">Inicia sesión</a> para guardar tus resultados y ver tu avance.</span></p>`);
  }

  // Preguntas de opción múltiple (simulacro, materia, quiz y exámenes de curso).
  function preguntas(contenedor, datos, meta) {
    const lista = datos.preguntas;
    const inicio = Date.now();
    const limite = meta.modo === "quiz" ? lista.length * SEG_POR_PREGUNTA_QUIZ : null;
    contenedor.innerHTML = `
      <form class="pila examen" novalidate>
        ${limite ? `<p class="rotulo cronometro" aria-live="off">Tiempo restante: <b data-reloj>${duracion(limite)}</b></p>` : ""}
        <ol class="examen__lista">
          ${lista.map((p, i) => `
            <li class="pregunta" data-i="${i}">
              <fieldset>
                <legend><span class="rotulo">Pregunta ${String(i + 1).padStart(2, "0")} / ${String(lista.length).padStart(2, "0")}${p.materia ? " · " + escapar(p.materia) : ""}${p.tema ? " · " + escapar(p.tema) : ""}</span>
                  <span class="pregunta__texto">${escapar(p.pregunta)}</span></legend>
                <div class="pregunta__opciones">
                  ${p.opciones.map((o, j) => `
                    <label class="opcion"><input type="radio" name="p${i}" value="${j}">
                      <span class="opcion__letra">${LETRAS[j]}</span><span>${escapar(o)}</span></label>`).join("")}
                </div>
                <div class="pregunta__explicacion" hidden></div>
              </fieldset>
            </li>`).join("")}
        </ol>
        <p class="form__mensaje form__mensaje--error" role="alert"></p>
        <div class="fila"><button class="btn btn--primario" type="submit">Calificar examen</button></div>
      </form>`;
    const form = contenedor.querySelector("form");
    let reloj = null;
    if (limite) {
      const etiqueta = form.querySelector("[data-reloj]");
      reloj = setInterval(() => {
        const resta = limite - Math.floor((Date.now() - inicio) / 1000);
        etiqueta.textContent = duracion(Math.max(0, resta));
        if (resta <= 0) { clearInterval(reloj); calificar(true); }
      }, 1000);
    }

    async function calificar(porTiempo = false) {
      const sinResponder = lista.filter((_, i) => !form.querySelector(`[name=p${i}]:checked`)).length;
      if (sinResponder && !porTiempo && !confirm(`Te faltan ${sinResponder} preguntas. ¿Calificar de todos modos?`)) return;
      clearInterval(reloj);
      let aciertos = 0;
      const detalle = lista.map((p, i) => {
        const marcada = form.querySelector(`[name=p${i}]:checked`);
        const elegida = marcada ? Number(marcada.value) : null;
        const bien = elegida === p.correcta;
        if (bien) aciertos++;
        const li = form.querySelector(`.pregunta[data-i="${i}"]`);
        li.classList.add(bien ? "pregunta--bien" : "pregunta--mal");
        li.querySelectorAll(".opcion").forEach((op, j) => {
          op.classList.toggle("opcion--correcta", j === p.correcta);
          op.classList.toggle("opcion--incorrecta", j === elegida && !bien);
          op.querySelector("input").disabled = true;
        });
        const exp = li.querySelector(".pregunta__explicacion");
        exp.hidden = false;
        exp.innerHTML = `<span class="chip ${bien ? "chip--ok" : "chip--error"}">${bien ? "Correcta" : elegida === null ? "Sin responder" : "Incorrecta"}</span>
          <p>${escapar(p.explicacion || "")}</p>`;
        return { pregunta: p.pregunta, elegida, correcta: p.correcta, tema: p.tema || null };
      });
      form.querySelector('[type="submit"]').remove();
      const segundos = Math.round((Date.now() - inicio) / 1000);
      resultado(contenedor, aciertos, lista.length, segundos);
      notaGuardado(contenedor, await guardar(meta, aciertos, lista.length, segundos, detalle));
      meta.alTerminar && meta.alTerminar({ aciertos, total: lista.length });
    }
    form.addEventListener("submit", e => { e.preventDefault(); calificar(); });
  }

  // Flashcards: voltear y autoevaluar.
  function tarjetas(contenedor, datos, meta) {
    const lista = datos.tarjetas;
    contenedor.innerHTML = `
      <div class="pila">
        <div class="piezas">${lista.map((t, i) => `
          <article class="pieza tarjeta-repaso" data-i="${i}">
            <div class="pieza__meta"><span class="rotulo">${codigo("FLA", i + 1)}</span><span class="rotulo">${escapar(t.tema || "")}</span></div>
            <p class="pieza__titulo pieza__titulo--sm">${escapar(t.frente)}</p>
            <p class="tarjeta-repaso__reverso" hidden>${escapar(t.reverso)}</p>
            <div class="pieza__pie">
              <button class="btn btn--secundario btn--sm" type="button" data-voltear>Ver respuesta</button>
              <div class="fila" data-autoevaluar hidden>
                <button class="btn btn--sm btn--secundario" type="button" data-sabia="1">${icono("ok", "icono--16")} La sabía</button>
                <button class="btn btn--sm btn--secundario" type="button" data-sabia="0">Repasar</button>
              </div>
            </div>
          </article>`).join("")}</div>
        <div class="fila"><button class="btn btn--primario" type="button" data-terminar>Terminar repaso</button></div>
      </div>`;
    const respuestas = new Map();
    contenedor.addEventListener("click", async e => {
      const tarjeta = e.target.closest(".tarjeta-repaso");
      if (e.target.closest("[data-voltear]")) {
        tarjeta.querySelector(".tarjeta-repaso__reverso").hidden = false;
        tarjeta.querySelector("[data-autoevaluar]").hidden = false;
        e.target.closest("[data-voltear]").remove();
      }
      const sabia = e.target.closest("[data-sabia]");
      if (sabia) {
        respuestas.set(Number(tarjeta.dataset.i), sabia.dataset.sabia === "1");
        tarjeta.querySelector("[data-autoevaluar]").innerHTML = `<span class="chip ${sabia.dataset.sabia === "1" ? "chip--ok" : "chip--aviso"}">${sabia.dataset.sabia === "1" ? "La sabía" : "Para repasar"}</span>`;
      }
      if (e.target.closest("[data-terminar]")) {
        e.target.closest("[data-terminar]").remove();
        const aciertos = [...respuestas.values()].filter(Boolean).length;
        resultado(contenedor, aciertos, lista.length, null);
        notaGuardado(contenedor, await guardar(meta, aciertos, lista.length, null, [...respuestas.entries()]));
      }
    });
  }

  // Ejercicios resueltos paso a paso.
  function ejercicios(contenedor, datos, meta) {
    const lista = datos.ejercicios;
    contenedor.innerHTML = `
      <div class="pila">
        ${lista.map((x, i) => `
          <article class="pieza" data-i="${i}">
            <div class="pieza__meta"><span class="rotulo">${codigo("EJE", i + 1)}</span><span class="rotulo">${escapar(x.tema || "")}</span></div>
            <p class="pieza__titulo pieza__titulo--sm">${escapar(x.enunciado)}</p>
            <details class="acordeon"><summary>Ver solución paso a paso</summary>
              <div><ol class="pasos">${x.pasos.map(p => `<li class="paso"><p class="paso__texto">${escapar(p)}</p></li>`).join("")}</ol>
              <p class="nota nota--ok"><span class="rotulo">Respuesta</span><span>${escapar(x.respuesta)}</span></p></div>
            </details>
            <div class="fila" data-autoevaluar>
              <button class="btn btn--sm btn--secundario" type="button" data-bien="1">${icono("ok", "icono--16")} Me salió bien</button>
              <button class="btn btn--sm btn--secundario" type="button" data-bien="0">Me equivoqué</button>
            </div>
          </article>`).join("")}
        <div class="fila"><button class="btn btn--primario" type="button" data-terminar>Terminar ejercicios</button></div>
      </div>`;
    const respuestas = new Map();
    contenedor.addEventListener("click", async e => {
      const b = e.target.closest("[data-bien]");
      if (b) {
        const art = b.closest("[data-i]");
        respuestas.set(Number(art.dataset.i), b.dataset.bien === "1");
        art.querySelector("[data-autoevaluar]").innerHTML = `<span class="chip ${b.dataset.bien === "1" ? "chip--ok" : "chip--aviso"}">${b.dataset.bien === "1" ? "Resuelto" : "Para repasar"}</span>`;
      }
      if (e.target.closest("[data-terminar]")) {
        e.target.closest("[data-terminar]").remove();
        const aciertos = [...respuestas.values()].filter(Boolean).length;
        resultado(contenedor, aciertos, lista.length, null);
        notaGuardado(contenedor, await guardar(meta, aciertos, lista.length, null, [...respuestas.entries()]));
      }
    });
  }

  function pintar(contenedor, datos, meta) {
    if (datos.tarjetas) return tarjetas(contenedor, datos, meta);
    if (datos.ejercicios) return ejercicios(contenedor, datos, meta);
    return preguntas(contenedor, datos, meta);
  }

  return { generar, pintar };
})();
