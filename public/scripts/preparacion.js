// Lámina Preparación: generador de exámenes con IA (o banco local) y desempeño personal.

const MODOS = {
  simulacro: { nombre: "Simulacro", ayuda: "12 preguntas de todas las materias. Mide tu nivel general." },
  materia: { nombre: "Por materia", ayuda: "8 preguntas de una materia. Agrega un tema para enfocarte." },
  quiz: { nombre: "Quiz rápido", ayuda: "5 preguntas con 30 segundos cada una." },
  ejercicios: { nombre: "Ejercicios", ayuda: "4 ejercicios resueltos paso a paso." },
  flashcards: { nombre: "Flashcards", ayuda: "4 tarjetas para repasar conceptos clave." }
};
let modo = parametro("modo") in MODOS ? parametro("modo") : "simulacro";
let variante = 1;
let estado = { temario: Object.keys(BANCO) };

const selMateria = document.getElementById("materia");

function pintarModos() {
  document.getElementById("modos").innerHTML = Object.entries(MODOS).map(([id, m]) =>
    `<button type="button" class="chip" role="radio" aria-checked="${id === modo}" aria-pressed="${id === modo}" data-modo="${id}">${m.nombre}</button>`).join("");
  document.getElementById("ayudaModo").textContent = MODOS[modo].ayuda;
  selMateria.disabled = modo === "simulacro";
  selMateria.closest(".campo").style.opacity = modo === "simulacro" ? .5 : 1;
}

document.getElementById("modos").addEventListener("click", e => {
  const b = e.target.closest("[data-modo]");
  if (!b) return;
  modo = b.dataset.modo;
  variante = 1;
  pintarModos();
});

async function generarExamen() {
  const boton = document.getElementById("botonGenerar");
  boton.textContent = "Generando…";
  const opciones = { modo, materia: modo === "simulacro" ? null : selMateria.value, tema: document.getElementById("tema").value.trim(),
    nivel: document.getElementById("nivel").value, variante };
  opciones.cantidad = { simulacro: 12, materia: 8, quiz: 5, ejercicios: 4, flashcards: 4 }[modo];
  let r;
  try { r = await ocupado(boton, () => Examen.generar(opciones)); }
  finally { boton.textContent = "Generar examen"; }

  const practica = document.getElementById("practica");
  practica.hidden = false;
  const titulo = `${MODOS[modo].nombre}${opciones.materia ? " · " + opciones.materia : ""}${opciones.tema ? " · " + opciones.tema : ""}`;
  document.getElementById("tituloExamen").textContent = titulo;
  document.getElementById("origen").textContent = r.origen === "ia" ? (r.cache ? "IA · desde caché" : "Generado con IA") : "Banco local";
  document.getElementById("avisoOrigen").innerHTML = r.aviso
    ? `<p class="nota nota--aviso"><span class="rotulo">Sin IA</span><span>${escapar(r.aviso)}</span></p>`
    : r.datos.fuentes?.length ? `<p class="nota"><span class="rotulo">Basado en</span><span>${r.datos.fuentes.map(escapar).join(" · ")}</span></p>` : "";
  document.getElementById("otraVariante").hidden = r.origen !== "ia";
  Examen.pintar(document.getElementById("contenedorExamen"), r.datos, {
    modo, materia: opciones.materia || "General", titulo, alTerminar: cargarDesempeno
  });
  practica.scrollIntoView({ behavior: "smooth", block: "start" });
}

document.getElementById("formGenerar").addEventListener("submit", e => { e.preventDefault(); generarExamen(); });
document.getElementById("otraVariante").addEventListener("click", () => { variante++; generarExamen(); });

async function cargarDesempeno() {
  const caja = document.getElementById("contenidoDesempeno");
  if (!caja.children.length) Esqueleto.poner(caja, Esqueleto.kpis(4) + Esqueleto.tabla(3), "Cargando tu desempeño…");
  const yo = await Sesion.yo();
  if (!yo.usuario) {
    caja.innerHTML = `<div class="vacio"><p>Como invitado puedes practicar todo lo que quieras, pero tus resultados no se guardan.</p>
      <a class="btn btn--secundario" href="login.html?volver=preparacion.html">Iniciar sesión para guardar mi avance</a></div>`;
    return;
  }
  let d;
  try { d = await API.get("ia.php", { accion: "desempeno" }); } catch (err) { caja.innerHTML = `<p>${escapar(err.message)}</p>`; return; }
  const r = d.resumen;
  if (!Number(r.intentos)) {
    caja.innerHTML = `<div class="vacio"><p>Todavía no tienes exámenes. Empieza con un simulacro para saber en qué materias reforzar.</p></div>`;
    return;
  }
  caja.innerHTML = `
    <div class="pila" style="gap: var(--e-6)">
      <div class="kpis">
        <div class="kpi"><span class="rotulo">Exámenes</span><span class="kpi__valor">${r.intentos}</span></div>
        <div class="kpi"><span class="rotulo">Promedio</span><span class="kpi__valor">${Math.round(r.promedio)} %</span></div>
        <div class="kpi"><span class="rotulo">Mejor</span><span class="kpi__valor">${Math.round(r.mejor)} %</span></div>
        <div class="kpi"><span class="rotulo">Preguntas</span><span class="kpi__valor">${r.preguntas}</span></div>
      </div>
      <div class="pila">
        <p class="rotulo">Promedio por materia · de la más débil a la más fuerte</p>
        <ul class="barras">${d.por_materia.map(m => `
          <li class="barra"><span class="barra__nombre">${escapar(m.materia)}</span>
            <span class="barra__pista"><span class="barra__relleno" style="--v:${(m.promedio / 100).toFixed(3)}"></span></span>
            <span class="barra__valor">${Math.round(m.promedio)} %</span></li>`).join("")}</ul>
      </div>
      <div class="pila">
        <p class="rotulo">Últimos intentos</p>
        <div class="tabla-caja"><table class="tabla">
          <thead><tr><th>Fecha</th><th>Práctica</th><th class="num">Aciertos</th><th class="num">Calificación</th></tr></thead>
          <tbody>${d.ultimos.map(i => `<tr><td class="mono">${fecha(i.creado, true)}</td><td>${escapar(i.titulo)}</td>
            <td class="num">${i.aciertos} / ${i.total}</td><td class="num">${Math.round(i.puntaje)} %</td></tr>`).join("")}</tbody>
        </table></div>
      </div>
    </div>`;
}

(async () => {
  try {
    estado = await API.get("ia.php", { accion: "estado" });
  } catch { /* sin API: banco local */ }
  const chip = document.getElementById("estadoIa");
  const guias = Object.values(estado.guias || {}).reduce((a, n) => a + Number(n), 0);
  chip.textContent = estado.ia ? `IA activa · ${estado.modelo}${guias ? ` · ${guias} ${guias === 1 ? "guía" : "guías"}` : ""}` : "Sin IA · banco local";
  chip.classList.add(estado.ia ? "chip--ok" : "chip--aviso");
  selMateria.innerHTML = estado.temario.map(m => `<option>${escapar(m)}</option>`).join("");
  const materiaUrl = parametro("materia");
  if (materiaUrl && estado.temario.includes(materiaUrl)) selMateria.value = materiaUrl;
  pintarModos();
  cargarDesempeno();
  if (location.hash === "#desempeno") document.getElementById("desempeno").scrollIntoView();
})();
