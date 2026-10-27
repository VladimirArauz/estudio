// Mide qué páginas se visitan y cuánto tiempo (solo mientras la pestaña está visible).
(function () {
  const vista = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
  const ruta = location.pathname.split("/").pop() + location.search;
  const seccion = document.body.dataset.activa || document.body.dataset.pagina || "otra";
  let segundos = 0;
  let desde = document.visibilityState === "visible" ? Date.now() : null;

  function acumular() {
    if (desde) { segundos += (Date.now() - desde) / 1000; desde = document.visibilityState === "visible" ? Date.now() : null; }
  }

  async function enviar(beacon = false) {
    acumular();
    const yo = await Sesion.yo();
    if (yo.sinApi) return;
    const cuerpo = JSON.stringify({ vista_id: vista, ruta, seccion, segundos: Math.round(segundos), csrf: yo.csrf });
    const url = new URL("api/visita.php", document.baseURI);
    if (beacon && navigator.sendBeacon) navigator.sendBeacon(url, new Blob([cuerpo], { type: "application/json" }));
    else fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: cuerpo, keepalive: true }).catch(() => {});
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") desde = Date.now();
    else enviar(true);
  });
  addEventListener("pagehide", () => enviar(true));
  setInterval(() => document.visibilityState === "visible" && enviar(), 30000);
  enviar();
})();
