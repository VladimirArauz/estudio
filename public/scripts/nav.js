// Índice de láminas (design.md §6), pie de página (§7.10) y animaciones de entrada (§9).
// Cada página declara su lámina activa con <body data-activa="estudio|apoyo|preparacion">.

const LAMINAS = [
  { id: "estudio", folio: "01", nombre: "Estudio", codigo: "EST", sec: "var(--sec-estudio)", href: "index.html#estudio" },
  { id: "apoyo", folio: "02", nombre: "Apoyo", codigo: "APO", sec: "var(--sec-apoyo)", href: "index.html#apoyo" },
  { id: "preparacion", folio: "03", nombre: "Preparación", codigo: "PRE", sec: "var(--sec-preparacion)", href: "index.html#preparacion" }
];

(function construirNav() {
  const esInicio = document.body.dataset.pagina === "inicio";
  const activa = document.body.dataset.activa;

  const items = LAMINAS.map((l, i) => `
    <li><a class="nav__item" href="${esInicio ? "#" + l.id : l.href}" data-lamina-id="${l.id}" style="--sec:${l.sec}; --i:${i}"
      ${activa === l.id ? 'aria-current="page"' : ""}>
      <span class="nav__folio">${l.folio}</span><span class="nav__nombre">${l.nombre}</span><span class="nav__codigo">${l.codigo}</span>
    </a></li>`).join("");

  document.body.insertAdjacentHTML("afterbegin", `
    <a class="saltar" href="#contenido">Saltar al contenido</a>
    <button class="nav-boton" type="button" aria-controls="nav" aria-expanded="false">
      <span class="nav-boton__icono" aria-hidden="true"><span></span><span></span><span></span></span>
      <span class="nav-boton__rotulo">ÍNDICE</span>
    </button>
    <div class="nav-gatillo" aria-hidden="true"></div>
    <div class="nav-riel" aria-hidden="true"><span class="nav-riel__marca"></span></div>
    <div class="nav-velo" aria-hidden="true"></div>
    <nav class="nav" id="nav" aria-label="Índice de láminas" data-abierto="false">
      <button class="btn btn--secundario btn--sm nav__cerrar" type="button">${icono("cerrar", "icono--16")} Cerrar</button>
      <a class="nav__marca" href="index.html">
        <span class="nav__sello" aria-hidden="true">C9</span>
        <span class="nav__titulo"><small>CECyT 9</small>Bátiz<br>hasta la muerte</span>
      </a>
      <hr class="nav__sep">
      <div class="pila" style="gap: var(--e-2)">
        <p class="rotulo">Índice de láminas</p>
        <ul class="nav__lista">${items}</ul>
      </div>
      <hr class="nav__sep">
      <div class="nav__cuenta" id="navCuenta"></div>
      <div class="nav__pie">
        <div class="tema">
          <span>Tema</span>
          <span class="tema__opciones" role="group" aria-label="Tema de color">
            <button type="button" data-tema="dark">Plano</button>
            <button type="button" data-tema="light">Papel</button>
          </span>
        </div>
        <p><b>IPN</b> · «La técnica al servicio de la patria»</p>
      </div>
    </nav>`);

  if (!document.body.hasAttribute("data-sin-pie")) {
    document.body.insertAdjacentHTML("beforeend", `
      <footer class="pie">
        <div class="contenedor pie__rejilla">
          <div>
            <p class="pie__nombre">Bátiz hasta la muerte</p>
            <p class="pie__texto">Hecho por estudiantes de la Voca 9. Sitio estudiantil, no es un sitio oficial del IPN.</p>
          </div>
          <ul class="pie__enlaces">
            ${LAMINAS.map(l => `<li><a href="${l.href}">${l.folio} · ${l.nombre}</a></li>`).join("")}
            <li><a href="preparacion.html">Generador de exámenes</a></li>
          </ul>
        </div>
        <div class="pie__franja"></div>
      </footer>`);
  }
})();

// Comportamiento del panel: intención de apertura 80ms, gracia de cierre 300ms.
(function comportamientoNav() {
  const nav = document.querySelector(".nav");
  const gatillo = document.querySelector(".nav-gatillo");
  const boton = document.querySelector(".nav-boton");
  const velo = document.querySelector(".nav-velo");
  let tAbrir, tCerrar;

  function fijar(abierto) {
    nav.dataset.abierto = String(abierto);
    boton.setAttribute("aria-expanded", String(abierto));
    velo.dataset.visible = String(abierto && matchMedia("(hover: none)").matches);
  }
  const abrir = () => { clearTimeout(tCerrar); tAbrir = setTimeout(() => fijar(true), 80); };
  const cerrar = () => { clearTimeout(tAbrir); tCerrar = setTimeout(() => fijar(false), 300); };

  gatillo.addEventListener("pointerenter", abrir);
  gatillo.addEventListener("pointerleave", () => clearTimeout(tAbrir));
  nav.addEventListener("pointerenter", () => clearTimeout(tCerrar));
  nav.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") cerrar(); });

  boton.addEventListener("click", () => fijar(nav.dataset.abierto !== "true"));
  velo.addEventListener("click", () => fijar(false));
  nav.querySelector(".nav__cerrar").addEventListener("click", () => { fijar(false); boton.focus(); });
  nav.addEventListener("click", e => { if (e.target.closest("a")) fijar(false); });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape" || nav.dataset.abierto !== "true" && !nav.contains(document.activeElement)) return;
    fijar(false);
    if (nav.contains(document.activeElement)) boton.offsetParent ? boton.focus() : document.activeElement.blur();
  });

  // Tema Plano / Papel.
  const raiz = document.documentElement;
  const botonesTema = nav.querySelectorAll("[data-tema]");
  function temaActual() {
    return raiz.dataset.theme || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  }
  function marcarTema() {
    botonesTema.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tema === temaActual())));
  }
  botonesTema.forEach(b => b.addEventListener("click", () => {
    raiz.dataset.theme = b.dataset.tema;
    try { localStorage.setItem("tema", b.dataset.tema); } catch { /* sin almacenamiento */ }
    marcarTema();
  }));
  marcarTema();

  // La marca del riel sigue el avance del scroll.
  const marca = document.querySelector(".nav-riel__marca");
  function moverMarca() {
    const max = document.documentElement.scrollHeight - innerHeight;
    const avance = max > 0 ? scrollY / max : 0;
    marca.style.transform = `translateY(${avance * (innerHeight - 40)}px)`;
  }
  addEventListener("scroll", moverMarca, { passive: true });
  addEventListener("resize", moverMarca);
  moverMarca();

  // Lámina activa en la página de inicio: aria-current según la sección visible.
  const laminas = document.querySelectorAll("[data-lamina]");
  if (laminas.length && "IntersectionObserver" in window) {
    const enlaces = nav.querySelectorAll(".nav__item");
    const observador = new IntersectionObserver(entradas => {
      entradas.forEach(e => {
        if (!e.isIntersecting) return;
        enlaces.forEach(a => a.dataset.laminaId === e.target.id
          ? a.setAttribute("aria-current", "true")
          : a.removeAttribute("aria-current"));
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    laminas.forEach(l => observador.observe(l));
  }
})();

// Cuenta (iniciar sesión o datos del usuario).
(async function cuentaNav() {
  const caja = document.getElementById("navCuenta");
  Esqueleto.poner(caja, Esqueleto.cuenta(), "Cargando sesión…");
  const yo = await Sesion.aplicar();
  const ROLES = { admin: "Admin", profesor: "Profesor", alumno: "Alumno", invitado: "Invitado" };
  if (!yo.usuario) {
    caja.innerHTML = `
      <p class="rotulo">Cuenta · ${ROLES.invitado}</p>
      ${yo.sinApi ? '<p class="nav__usuario">Sin conexión con el servidor.</p>' : ""}
      <a class="nav__item" style="--i:4" href="login.html">${icono("entrar", "icono--16")}<span class="nav__nombre">Iniciar sesión</span><span></span></a>
      <a class="nav__item" style="--i:5" href="login.html#registro">${icono("usuario", "icono--16")}<span class="nav__nombre">Crear cuenta</span><span></span></a>`;
    return;
  }
  const extras = [];
  if (yo.rol === "admin") extras.push(["panel.html", "panel", "Panel de control"]);
  if (yo.rol === "profesor" || yo.rol === "alumno") extras.push(["cursos.html", "curso", "Mis cursos"]);
  extras.push(["preparacion.html#desempeno", "estrella", "Mi desempeño"]);
  extras.push(["login.html", "usuario", "Mi cuenta"]);
  caja.innerHTML = `
    <p class="rotulo">Cuenta · <b>${ROLES[yo.rol]}</b></p>
    <p class="nav__usuario">${escapar(yo.usuario.nombre)}</p>
    ${yo.usuario.requiere_verificar && !yo.usuario.email_verificado && !yo.usuario.telefono_verificado
      ? '<a class="chip chip--aviso" href="login.html" id="navVerificar">Verifica tu cuenta</a>' : ""}
    ${extras.map(([href, ic, texto], i) => `<a class="nav__item" style="--i:${4 + i}" href="${href}">${icono(ic, "icono--16")}<span class="nav__nombre">${texto}</span><span></span></a>`).join("")}
    <button class="btn btn--terciario btn--sm" type="button" id="cerrarSesion">${icono("salir", "icono--16")} Cerrar sesión</button>`;
  document.getElementById("cerrarSesion").addEventListener("click", async () => {
    try { await API.post("auth.php", {}, { accion: "salir" }); } catch { /* ya no había sesión */ }
    location.href = "index.html";
  });
})();

// Animaciones de entrada: cotas, contadores y revelado. El reposo siempre es legible.
const Animar = (() => {
  const reducir = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function contar(el) {
    const meta = Number(el.dataset.contar);
    const sufijo = el.dataset.sufijo || "";
    if (reducir || !meta) { el.textContent = meta + sufijo; return; }
    const t0 = performance.now();
    const paso = ahora => {
      const p = Math.min(1, (ahora - t0) / 700);
      el.textContent = Math.round(meta * (1 - Math.pow(1 - p, 3))) + sufijo;
      if (p < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }
  const observador = "IntersectionObserver" in window ? new IntersectionObserver(entradas => {
    entradas.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      if (el.classList.contains("cota")) {
        el.classList.add("dibujada");
        el.querySelectorAll("[data-contar]").forEach(contar);
      } else {
        el.classList.add("visible");
      }
      observador.unobserve(el);
    });
  }, { threshold: .15 }) : null;

  function registrar(raiz = document) {
    raiz.querySelectorAll(".cota:not(.dibujada), .revelar:not(.visible)").forEach(el => {
      if (observador) observador.observe(el);
      else { el.classList.add("dibujada", "visible"); el.querySelectorAll("[data-contar]").forEach(contar); }
    });
  }
  registrar();
  return { registrar, contar };
})();

// Plantilla de cota para encabezados: ├──── medida ┤
function cota(valor, unidad) {
  return `<div class="cota" aria-hidden="true"><span class="cota__linea"></span>
    <span class="cota__medida"><span data-contar="${Number(valor) || 0}">${Number(valor) || 0}</span> ${escapar(unidad)}</span></div>`;
}
