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
      const respuesta = await fetch(url(ruta, params), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF": await token() },
        body: JSON.stringify(datos)
      });
      return leer(respuesta);
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
