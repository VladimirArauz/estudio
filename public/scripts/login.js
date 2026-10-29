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
    if (r.paso === "2fa") return pedirCodigo();
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

// Segundo paso del inicio de sesión: código de la app de autenticación.
const formCodigo = document.getElementById("formCodigo");
function pedirCodigo() {
  formEntrar.hidden = formRegistro.hidden = true;
  document.querySelector('[role="tablist"]').hidden = true;
  document.getElementById("tituloAcceso").textContent = "Verificación en dos pasos";
  formCodigo.hidden = false;
  OTP.montar(document.getElementById("cajaCodigo"), {
    id: "codigoEntrar", etiqueta: "Código de verificación", alternativo: true,
    alCompletar: async codigo => {
      try {
        await API.post("auth.php", { codigo }, { accion: "verificar_2fa" });
      } catch (err) {
        if (err.status === 401 && /5 minutos|contraseña/.test(err.message)) setTimeout(() => location.reload(), 2500);
        return err.message;
      }
      API.olvidarToken();
      setTimeout(irDestino, 600); // deja ver el estado «Verificado»
      return true;
    }
  }).enfocar();
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
  if (yo.pendiente_2fa) return pedirCodigo();
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
  pintarDosPasos(yo);
})();

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
  caja.innerHTML = `
    ${yo.rol === "admin" ? '<p class="nota nota--aviso"><span class="rotulo">Obligatoria</span><span>Las cuentas de admin necesitan la verificación en dos pasos para usar el panel de control.</span></p>' : ""}
    <p class="texto-2">Además de tu contraseña, te pediremos un código de una app como Google Authenticator, Microsoft Authenticator o Aegis.
      Así, aunque alguien sepa tu contraseña, no podrá entrar.</p>
    <div class="form__acciones" style="justify-content: flex-start"><button class="btn btn--secundario" type="button" data-iniciar>Activar verificación en dos pasos</button></div>`;
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
