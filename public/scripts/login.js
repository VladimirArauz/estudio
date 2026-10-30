// Inicio de sesión y registro.

const formEntrar = document.getElementById("formEntrar");
const formRegistro = document.getElementById("formRegistro");

function mostrar(registro) {
  formEntrar.hidden = registro;
  formRegistro.hidden = !registro;
  document.getElementById("tabEntrar").setAttribute("aria-selected", String(!registro));
  document.getElementById("tabRegistro").setAttribute("aria-selected", String(registro));
  document.getElementById("tituloAcceso").textContent = registro ? "Crear cuenta" : "Iniciar sesión";
}
document.getElementById("tabEntrar").addEventListener("click", () => mostrar(false));
document.getElementById("tabRegistro").addEventListener("click", () => mostrar(true));
mostrar(location.hash === "#registro");

// Marca el campo con error y explica qué corregir.
function validar(form, reglas) {
  form.querySelectorAll(".campo--error").forEach(c => c.classList.remove("campo--error"));
  for (const [id, prueba, mensaje] of reglas) {
    const input = document.getElementById(id);
    if (!prueba(input.value.trim())) {
      input.closest(".campo").classList.add("campo--error");
      input.focus();
      return mensaje;
    }
  }
  return "";
}

async function enviar(form, accion, datos, reglas) {
  const error = form.querySelector(".form__mensaje");
  error.textContent = validar(form, reglas);
  if (error.textContent) return;
  const boton = form.querySelector('[type="submit"]');
  boton.disabled = true;
  try {
    const r = await API.post("auth.php", datos(), { accion });
    API.olvidarToken();
    if (r.paso === "2fa") return pedirCodigo(r);
    if (r.paso === "verificar") return pedirVerificacion();
    irDestino();
  } catch (err) {
    error.textContent = err.message;
    boton.disabled = false;
  }
}

function irDestino() {
  const destino = new URLSearchParams(location.search).get("volver");
  // Solo se permite volver a una página propia (evita redirecciones a otros sitios).
  location.href = destino && /^[a-z]+\.html([?#][\w=&%#.-]*)?$/.test(destino) ? destino : "index.html";
}

// Segundo paso del inicio de sesión: código de la app de autenticación (TOTP) o enviado por correo.
const formCodigo = document.getElementById("formCodigo");
function pedirCodigo(r = {}) {
  formEntrar.hidden = formRegistro.hidden = true;
  document.querySelector('[role="tablist"]').hidden = true;
  document.getElementById("tituloAcceso").textContent = "Verificación en dos pasos";
  formCodigo.hidden = false;
  const verificar = async codigo => {
    try {
      await API.post("auth.php", { codigo }, { accion: "verificar_2fa" });
    } catch (err) {
      if (err.status === 401 && /5 minutos|contraseña/.test(err.message)) setTimeout(() => location.reload(), 2500);
      throw err;
    }
    API.olvidarToken();
  };
  const caja = document.getElementById("cajaCodigo");
  if (r.metodo === "correo") {
    document.getElementById("textoCodigo").textContent = "Tu cuenta pide un código además de la contraseña.";
    return flujoCodigo(caja, {
      id: "codigoEntrar", enviado: r.destino ? r : null, verificar, alTerminar: irDestino,
      enviar: () => API.post("auth.php", {}, { accion: "codigo_reenviar_login" })
    });
  }
  OTP.montar(caja, {
    id: "codigoEntrar", etiqueta: "Código de verificación", alternativo: true,
    alCompletar: async codigo => {
      try { await verificar(codigo); } catch (err) { return err.message; }
      setTimeout(irDestino, 600); // deja ver el estado «Verificado»
      return true;
    }
  }).enfocar();
}

// «¿Olvidaste tu contraseña?»: correo → código → contraseña nueva → volver a entrar.
const secRecuperar = document.getElementById("recuperar");
const formRecuperar = document.getElementById("formRecuperar");
const cajaRecuperar = document.getElementById("cajaRecuperar");
document.getElementById("olvide").addEventListener("click", () => {
  formEntrar.hidden = true;
  document.querySelector('[role="tablist"]').hidden = true;
  document.getElementById("tituloAcceso").textContent = "Recupera tu cuenta";
  secRecuperar.hidden = formRecuperar.hidden = false;
  cajaRecuperar.innerHTML = "";
  document.getElementById("emailRecuperar").value = document.getElementById("emailEntrar").value.trim();
  document.getElementById("emailRecuperar").focus();
});
function volverAEntrar(email = "", aviso = "") {
  secRecuperar.hidden = true;
  document.querySelector('[role="tablist"]').hidden = false;
  mostrar(false);
  if (email) document.getElementById("emailEntrar").value = email;
  const mensaje = formEntrar.querySelector(".form__mensaje");
  mensaje.className = "form__mensaje " + (aviso ? "form__mensaje--ok" : "form__mensaje--error");
  mensaje.textContent = aviso;
  document.getElementById(email ? "passEntrar" : "emailEntrar").focus();
}
formRecuperar.querySelector("[data-volver]").addEventListener("click", () => volverAEntrar());
formRecuperar.addEventListener("submit", e => {
  e.preventDefault();
  const error = validar(formRecuperar, [["emailRecuperar", esCorreo, "Escribe tu correo completo, por ejemplo nombre@gmail.com."]]);
  formRecuperar.querySelector(".form__mensaje").textContent = error;
  if (error) return;
  const email = document.getElementById("emailRecuperar").value.trim();
  formRecuperar.hidden = true;
  flujoCodigo(cajaRecuperar, {
    id: "codigoRecuperar",
    enviar: () => API.post("auth.php", { email }, { accion: "recuperar_enviar" }),
    verificar: codigo => API.post("auth.php", { email, codigo }, { accion: "recuperar_verificar" }),
    alTerminar: () => nuevaContrasena(email)
  });
});
function nuevaContrasena(email) {
  cajaRecuperar.innerHTML = `
    <form class="form" novalidate>
      <div class="campo"><label for="passRecuperar">Contraseña nueva</label>
        <input type="password" id="passRecuperar" autocomplete="new-password" minlength="10" required>
        <span class="campo__ayuda">Mínimo 10 caracteres. Al guardarla se cerrarán tus sesiones abiertas en otros dispositivos.</span></div>
      <p class="form__mensaje form__mensaje--error" role="alert"></p>
      <div class="form__acciones" style="justify-content: flex-start"><button class="btn btn--primario" type="submit">Guardar contraseña</button></div>
    </form>`;
  const form = cajaRecuperar.querySelector("form");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const mensaje = form.querySelector(".form__mensaje");
    mensaje.textContent = validar(form, [["passRecuperar", v => v.length >= PASSWORD_MIN, `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`]]);
    if (mensaje.textContent) return;
    try {
      await API.post("auth.php", { nueva: form.querySelector("#passRecuperar").value }, { accion: "recuperar_cambiar" });
      API.olvidarToken();
      volverAEntrar(email, "Listo: tu contraseña cambió. Entra con la nueva.");
    } catch (err) {
      mensaje.textContent = err.message;
      if (err.status === 401) setTimeout(() => volverAEntrar(email), 2500);
    }
  });
  form.querySelector("#passRecuperar").focus();
}

const esCorreo = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const PASSWORD_MIN = 10;

formEntrar.addEventListener("submit", e => {
  e.preventDefault();
  enviar(formEntrar, "entrar",
    () => ({ email: document.getElementById("emailEntrar").value.trim(), password: document.getElementById("passEntrar").value }),
    [["emailEntrar", esCorreo, "Escribe tu correo completo, por ejemplo nombre@gmail.com."],
     ["passEntrar", v => v.length > 0, "Escribe tu contraseña."]]);
});

// Con sesión iniciada, la página muestra «Tu cuenta» con el cambio de contraseña.
(async () => {
  const yo = await Sesion.yo();
  document.getElementById("olvide").hidden = !yo.correo;
  if (yo.pendiente_2fa) return pedirCodigo(yo.pendiente ? { metodo: "correo", ...yo.pendiente } : {});
  if (!yo.usuario) return;
  document.getElementById("tituloAcceso").textContent = "Tu cuenta";
  document.querySelector('[role="tablist"]').hidden = true;
  formEntrar.hidden = formRegistro.hidden = true;
  document.getElementById("cuenta").hidden = false;
  document.getElementById("cuentaDatos").textContent = `${yo.usuario.nombre} · ${yo.usuario.email} · ${yo.rol}`;
  const form = document.getElementById("formPassword");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const mensaje = form.querySelector(".form__mensaje");
    const error = validar(form, [["passActual", v => v.length > 0, "Escribe tu contraseña actual."],
      ["passNueva", v => v.length >= PASSWORD_MIN, `La contraseña nueva debe tener al menos ${PASSWORD_MIN} caracteres.`]]);
    mensaje.className = "form__mensaje form__mensaje--error";
    mensaje.textContent = error;
    if (error) return;
    try {
      await API.post("auth.php", { actual: document.getElementById("passActual").value, nueva: document.getElementById("passNueva").value }, { accion: "cambiar_password" });
      form.reset();
      mensaje.className = "form__mensaje form__mensaje--ok";
      mensaje.textContent = "Listo: tu contraseña cambió. Se cerraron tus sesiones en otros dispositivos.";
    } catch (err) { mensaje.textContent = err.message; }
  });
  pintarContacto(yo);
  pintarDosPasos(yo);
})();

// Manda un código (enviar) y muestra el input OTP con «Reenviar» y su cuenta regresiva.
// enviar() → { destino, reenviar_en }; verificar(codigo) lanza un Error si no es correcto.
// Con `enviado` (la respuesta de un envío que ya ocurrió) no vuelve a mandar al abrir.
function flujoCodigo(caja, { id, enviar, verificar, alTerminar, enviado = null, alternativo = false }) {
  caja.innerHTML = `
    <div class="pila" style="gap: var(--e-3)">
      <p class="texto-2" data-destino aria-live="polite">Enviando código…</p>
      <div data-otp></div>
      <div><button class="btn btn--terciario btn--sm" type="button" data-reenviar disabled>Reenviar código</button></div>
    </div>`;
  const destino = caja.querySelector("[data-destino]");
  const reenviar = caja.querySelector("[data-reenviar]");
  let reloj;
  function esperar(segundos) {
    clearInterval(reloj);
    const paso = () => {
      if (!caja.isConnected) return clearInterval(reloj);
      if (segundos <= 0) { clearInterval(reloj); reenviar.disabled = false; reenviar.textContent = "Reenviar código"; return; }
      reenviar.disabled = true;
      reenviar.textContent = `Reenviar en ${segundos--} s`;
    };
    paso();
    reloj = setInterval(paso, 1000);
  }
  function mostrar(r) {
    if (r.mensaje) { destino.textContent = r.mensaje; return esperar(r.reenviar_en); }
    destino.textContent = `Te mandamos un código de 6 dígitos a ${r.destino}. Caduca en 10 minutos.`;
    esperar(r.reenviar_en);
  }
  async function mandar() {
    reenviar.disabled = true;
    try { mostrar(await enviar()); }
    catch (err) { destino.textContent = err.message; esperar(err.datos?.reenviar_en || 0); }
  }
  reenviar.addEventListener("click", mandar);
  OTP.montar(caja.querySelector("[data-otp]"), {
    id, etiqueta: "Código de verificación", alternativo,
    alCompletar: async codigo => {
      try { await verificar(codigo); } catch (err) { return err.message; }
      clearInterval(reloj);
      reenviar.hidden = true;
      setTimeout(alTerminar, 700);
      return true;
    }
  }).enfocar();
  if (enviado) mostrar(enviado); else mandar();
}

// Verificar el correo de la cuenta.
function verificarCorreo(caja, alTerminar) {
  flujoCodigo(caja, {
    id: "codigoCorreo",
    enviar: () => API.post("auth.php", { proposito: "verificar_correo" }, { accion: "codigo_enviar" }),
    verificar: codigo => API.post("auth.php", { proposito: "verificar_correo", codigo }, { accion: "codigo_verificar" }),
    alTerminar
  });
}

// Después de crear la cuenta: verificar el correo (o dejarlo para después).
async function pedirVerificacion() {
  await Sesion.yo(true); // la sesión nueva trae otro token CSRF
  formEntrar.hidden = formRegistro.hidden = true;
  document.querySelector('[role="tablist"]').hidden = true;
  document.getElementById("tituloAcceso").textContent = "Verifica tu cuenta";
  document.getElementById("verificar").hidden = false;
  verificarCorreo(document.getElementById("cajaVerificar"), irDestino);
}
document.getElementById("verificarDespues").addEventListener("click", irDestino);

// «Mi cuenta» · correo: estado de verificación y verificarlo.
function pintarContacto(yo) {
  const caja = document.getElementById("contacto");
  const u = yo.usuario;
  caja.innerHTML = `
    ${u.requiere_verificar && !u.email_verificado && yo.correo
      ? '<p class="nota nota--aviso"><span class="rotulo">Pendiente</span><span>Verifica tu correo para subir material, postularte e inscribirte a cursos.</span></p>' : ""}
    <ul class="filas">
      <li><div class="filas__principal"><span class="filas__meta">Correo</span><span class="filas__titulo">${escapar(u.email)}</span></div>
        <div class="fila"><span class="chip ${u.email_verificado ? "chip--ok" : "chip--aviso"}">${u.email_verificado ? "Verificado" : "Sin verificar"}</span>
        ${u.email_verificado || !yo.correo ? "" : '<button class="btn btn--secundario btn--sm" type="button" data-verificar>Verificar</button>'}</div></li>
    </ul>
    <div data-flujo></div>`;
  caja.querySelector("[data-verificar]")?.addEventListener("click", () =>
    verificarCorreo(caja.querySelector("[data-flujo]"), async () => {
      avisar("Listo: quedó verificado.");
      const nuevo = await Sesion.yo(true);
      pintarContacto(nuevo);
      pintarDosPasos(nuevo);
    }));
}

// «Mi cuenta» · verificación en dos pasos: activar con QR, códigos de recuperación y (si no es admin) desactivar.
function pintarDosPasos(yo) {
  const caja = document.getElementById("dosPasos");
  if (yo.usuario.totp) {
    caja.innerHTML = `<p class="nota nota--ok"><span class="rotulo">Activa</span><span>Al entrar te pediremos un código de tu app de autenticación.</span></p>
      ${yo.rol === "admin" ? "" : '<div class="form__acciones" style="justify-content: flex-start"><button class="btn btn--secundario" type="button" data-desactivar>Desactivar</button></div>'}`;
    caja.querySelector("[data-desactivar]")?.addEventListener("click", async () => {
      if (!confirm("¿Desactivar la verificación en dos pasos? Tu cuenta quedará protegida solo con la contraseña.")) return;
      try { await API.post("auth.php", {}, { accion: "totp_desactivar" }); avisar("Verificación en dos pasos desactivada."); pintarDosPasos(await Sesion.yo(true)); }
      catch (err) { avisar(err.message, "error"); }
    });
    return;
  }
  const u = yo.usuario;
  const porCodigo = u.segundo_factor
    ? `<p class="nota nota--ok"><span class="rotulo">Activa</span><span>Al entrar te mandaremos un código
        a tu correo ${escapar(u.email)}.</span></p>
       <div class="form__acciones" style="justify-content: flex-start"><button class="btn btn--secundario" type="button" data-sin-codigo>Desactivar</button></div>`
    : "";
  caja.innerHTML = `
    ${yo.rol === "admin" ? '<p class="nota nota--aviso"><span class="rotulo">Obligatoria</span><span>Las cuentas de admin necesitan la verificación en dos pasos para usar el panel de control.</span></p>' : ""}
    ${porCodigo}
    <p class="texto-2">${u.segundo_factor ? "¿Prefieres una app? Es más segura que el correo y funciona sin internet: " : "Además de tu contraseña, "}te pediremos
      un código de una app como Google Authenticator, Microsoft Authenticator o Aegis. Así, aunque alguien sepa tu contraseña, no podrá entrar.</p>
    <div class="form__acciones" style="justify-content: flex-start"><button class="btn btn--secundario" type="button" data-iniciar>${u.segundo_factor ? "Usar una app de autenticación" : "Activar verificación en dos pasos"}</button></div>
    ${yo.rol !== "admin" && !u.segundo_factor && yo.correo ? `
      <p class="texto-2">¿No tienes una app? También podemos mandarte el código por correo cada vez que entres.</p>
      <div class="fila">
        <button class="btn btn--secundario btn--sm" type="button" data-codigo="correo"${u.email_verificado ? "" : " disabled"}>Código por correo</button>
      </div>
      ${u.email_verificado ? "" : '<span class="campo__ayuda">Primero verifica tu correo (arriba, en «Correo»).</span>'}` : ""}`;
  const repintar = async () => { const nuevo = await Sesion.yo(true); pintarContacto(nuevo); pintarDosPasos(nuevo); };
  caja.querySelectorAll("[data-codigo]").forEach(b => b.addEventListener("click", async () => {
    try { await API.post("auth.php", { metodo: b.dataset.codigo }, { accion: "segundo_factor" }); avisar("Listo: al entrar te pediremos un código."); repintar(); }
    catch (err) { avisar(err.message, "error"); }
  }));
  caja.querySelector("[data-sin-codigo]")?.addEventListener("click", async () => {
    if (!confirm("¿Desactivar el código al entrar? Tu cuenta quedará protegida solo con la contraseña.")) return;
    try { await API.post("auth.php", { metodo: null }, { accion: "segundo_factor" }); avisar("Verificación en dos pasos desactivada."); repintar(); }
    catch (err) { avisar(err.message, "error"); }
  });
  caja.querySelector("[data-iniciar]").addEventListener("click", async () => {
    let r;
    try { r = await API.post("auth.php", {}, { accion: "totp_iniciar" }); } catch (err) { return avisar(err.message, "error"); }
    const qr = qrcode(0, "M");
    qr.addData(r.uri);
    qr.make();
    caja.innerHTML = `
      <ol class="pila" style="padding-left: 1.2em">
        <li>Abre tu app de autenticación y escanea este código:
          <div style="background: #fff; padding: 12px; width: max-content; margin-top: var(--e-3)" aria-label="Código QR para la app de autenticación">${qr.createSvgTag({ cellSize: 5, margin: 0, scalable: false })}</div>
          <p class="texto-2">¿No puedes escanearlo? Escribe esta clave en la app: <code class="mono" style="word-break: break-all">${escapar(r.secreto.replace(/(.{4})/g, "$1 ").trim())}</code></p></li>
        <li><div data-activar></div></li>
      </ol>`;
    OTP.montar(caja.querySelector("[data-activar]"), {
      id: "codigoActivar", etiqueta: "Escribe el código de 6 dígitos que muestra la app",
      alCompletar: async codigo => {
        let a;
        try { a = await API.post("auth.php", { codigo }, { accion: "totp_activar" }); } catch (err) { return err.message; }
        setTimeout(() => mostrarRecuperacion(caja, a.recuperacion), 600);
        return true;
      }
    }).enfocar();
  });
}

function mostrarRecuperacion(caja, codigos) {
  caja.innerHTML = `<p class="nota nota--ok"><span class="rotulo">Activa</span><span>Listo: la verificación en dos pasos quedó activada.</span></p>
    <p><b>Guarda estos códigos de recuperación</b> en un lugar seguro. Sirven para entrar si pierdes tu teléfono; cada uno funciona una sola vez
      y no los volveremos a mostrar.</p>
    <ul class="mono" style="columns: 2">${codigos.map(c => `<li>${escapar(c)}</li>`).join("")}</ul>
    <div class="form__acciones" style="justify-content: flex-start"><button class="btn btn--secundario" type="button" data-listo>Ya los guardé</button></div>`;
  caja.querySelector("[data-listo]").addEventListener("click", async () => pintarDosPasos(await Sesion.yo(true)));
}

formRegistro.addEventListener("submit", e => {
  e.preventDefault();
  enviar(formRegistro, "registrar",
    () => ({
      nombre: document.getElementById("nombreRegistro").value.trim(),
      email: document.getElementById("emailRegistro").value.trim(),
      password: document.getElementById("passRegistro").value,
      rol: formRegistro.querySelector('[name="rol"]:checked').value
    }),
    [["nombreRegistro", v => v.length >= 2, "Escribe tu nombre completo."],
     ["emailRegistro", esCorreo, "Escribe un correo válido, por ejemplo nombre@gmail.com."],
     ["passRegistro", v => v.length >= PASSWORD_MIN, `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`]]);
});
