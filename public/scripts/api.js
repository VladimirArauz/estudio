// Cliente de la API PHP. Todas las peticiones que modifican datos llevan el token CSRF.
const API = (() => {
  const base = new URL("api/", document.baseURI).href;
  let csrf = null;

  async function token() {
    if (csrf) return csrf;
    const yo = await Sesion.yo();
    csrf = yo.csrf;
    return csrf;
  }

  async function leer(respuesta) {
    let datos = null;
    try { datos = await respuesta.json(); } catch { /* respuesta vacía */ }
    if (!respuesta.ok) {
      const error = new Error((datos && datos.error) || `Error ${respuesta.status}`);
      error.status = respuesta.status;
      error.datos = datos;
      throw error;
    }
    return datos;
  }

  // Diálogo para volver a escribir la contraseña (y el código 2FA si está activo). Resuelve true si se confirmó.
  async function confirmarIdentidad() {
    const yo = await Sesion.yo();
    const dialogo = document.createElement("dialog");
    dialogo.className = "modal";
    dialogo.innerHTML = `
      <form class="modal__cuerpo form" novalidate>
        <p class="rotulo">Seguridad</p>
        <h2 class="modal__titulo">Confirma que eres tú</h2>
        <p class="texto-2">Esta acción es delicada. Escribe tu contraseña${yo.usuario?.totp ? " y el código de tu app de autenticación" : ""}.</p>
        <div class="campo"><label for="reauthPass">Contraseña</label><input type="password" id="reauthPass" autocomplete="current-password" required></div>
        ${yo.usuario?.totp ? `<div class="campo"><label for="reauthCodigo">Código de verificación</label>
          <input id="reauthCodigo" inputmode="numeric" autocomplete="one-time-code" maxlength="11" required></div>` : ""}
        <p class="form__mensaje form__mensaje--error" role="alert"></p>
        <div class="form__acciones">
          <button type="button" class="btn btn--secundario" data-cancelar>Cancelar</button>
          <button type="submit" class="btn btn--primario">Confirmar</button>
        </div>
      </form>`;
    document.body.append(dialogo);
    return new Promise(resolver => {
      let confirmado = false;
      const form = dialogo.querySelector("form");
      dialogo.querySelector("[data-cancelar]").addEventListener("click", () => dialogo.close());
      dialogo.addEventListener("close", () => { dialogo.remove(); resolver(confirmado); });
      form.addEventListener("submit", async e => {
        e.preventDefault();
        try {
          await leer(await fetch(url("auth.php", { accion: "confirmar" }), {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json", "X-CSRF": await token() },
            body: JSON.stringify({ password: form.querySelector("#reauthPass").value, codigo: form.querySelector("#reauthCodigo")?.value || "" })
          }));
          confirmado = true;
          dialogo.close();
        } catch (err) {
          form.querySelector(".form__mensaje").textContent = err.message;
        }
      });
      dialogo.showModal();
      form.querySelector("#reauthPass").focus();
    });
  }

  function url(ruta, params) {
    const u = new URL(ruta, base);
    Object.entries(params || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, v); });
    return u;
  }

  return {
    url: (ruta, params) => url(ruta, params).href,
    async get(ruta, params) {
      return leer(await fetch(url(ruta, params), { credentials: "same-origin" }));
    },
    async post(ruta, datos = {}, params) {
      const enviar = async () => leer(await fetch(url(ruta, params), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF": await token() },
        body: JSON.stringify(datos)
      }));
      try {
        return await enviar();
      } catch (err) {
        // Acción delicada: el servidor pide confirmar la contraseña; si la persona la confirma, se repite.
        if (err.status === 428 && err.datos?.code === "REAUTH" && await confirmarIdentidad()) return enviar();
        throw err;
      }
    },
    // Subida con progreso (XMLHttpRequest permite medirlo).
    async subir(ruta, formData, alAvanzar) {
      const t = await token();
      return new Promise((resolver, rechazar) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url(ruta));
        xhr.setRequestHeader("X-CSRF", t);
        xhr.upload.onprogress = e => e.lengthComputable && alAvanzar && alAvanzar(e.loaded / e.total);
        xhr.onload = () => {
          let datos = null;
          try { datos = JSON.parse(xhr.responseText); } catch { /* vacío */ }
          if (xhr.status >= 200 && xhr.status < 300) resolver(datos);
          else rechazar(new Error((datos && datos.error) || `Error ${xhr.status}`));
        };
        xhr.onerror = () => rechazar(new Error("Se perdió la conexión durante la subida."));
        xhr.send(formData);
      });
    },
    olvidarToken() { csrf = null; }
  };
})();

// Sesión actual. Sin sesión, el rol es «invitado».
const Sesion = (() => {
  let promesa = null;
  return {
    yo(recargar = false) {
      if (!promesa || recargar) {
        promesa = fetch(new URL("api/auth.php?accion=yo", document.baseURI), { credentials: "same-origin" })
          .then(r => r.ok ? r.json() : Promise.reject(new Error("Sin conexión con la API")))
          .catch(() => ({ usuario: null, rol: "invitado", csrf: null, sinApi: true }));
      }
      return promesa;
    },
    // Muestra u oculta elementos según data-rol="alumno profesor admin" o "invitado".
    async aplicar() {
      const yo = await this.yo();
      document.documentElement.dataset.rol = yo.rol;
      document.querySelectorAll("[data-rol]").forEach(el => {
        el.hidden = !el.dataset.rol.split(/\s+/).includes(yo.rol);
      });
      return yo;
    },
    puedeSubir(yo) { return ["alumno", "profesor", "admin"].includes(yo.rol); }
  };
})();
