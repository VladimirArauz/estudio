// Input de código de un solo uso: una casilla por dígito, avance automático, pegar el código completo
// (o recibirlo del autocompletado del sistema), «pop» al escribir, rojo + sacudida + limpieza al fallar
// y brillo verde al acertar. Con prefers-reduced-motion solo cambia el color (base.css).
//
// const otp = OTP.montar(caja, { id: "codigoEntrar", etiqueta: "Código", alCompletar: async codigo => true | "mensaje de error" });
// alCompletar también puede lanzar un Error: su mensaje se muestra. { alternativo: true } agrega
// «Usar un código de recuperación» (códigos de 10 caracteres del TOTP).

const OTP = (() => {
  function montar(caja, { id = "codigo", largo = 6, etiqueta = "Código de verificación", alCompletar, alternativo = false } = {}) {
    caja.innerHTML = `
      <div class="otp" role="group" aria-labelledby="${id}Etiqueta">
        <p class="campo__etiqueta" id="${id}Etiqueta">${escapar(etiqueta)}</p>
        <div class="otp__casillas" id="${id}">
          ${Array.from({ length: largo }, (_, i) => `<input class="otp__casilla" inputmode="numeric" pattern="[0-9]*"
            ${i === 0 ? 'autocomplete="one-time-code"' : 'autocomplete="off"'} aria-label="Dígito ${i + 1} de ${largo}" data-i="${i}">`).join("")}
        </div>
        ${alternativo ? `<form class="otp__alterno fila" novalidate hidden>
            <input class="input mono" id="${id}Alterno" autocomplete="one-time-code" maxlength="11" aria-label="Código de recuperación">
            <button class="btn btn--primario btn--sm" type="submit">Verificar</button>
          </form>
          <button class="btn btn--terciario btn--sm otp__cambiar" type="button">Usar un código de recuperación</button>` : ""}
        <p class="otp__estado" aria-live="polite"></p>
      </div>`;
    const raiz = caja.querySelector(".otp");
    const casillas = [...raiz.querySelectorAll(".otp__casilla")];
    const estado = raiz.querySelector(".otp__estado");
    let ocupado = false;

    casillas.forEach((c, i) => c.style.setProperty("--i", i));

    const valor = () => casillas.map(c => c.value).join("");
    function mensaje(texto, tipo = "") {
      estado.textContent = texto;
      estado.className = "otp__estado" + (tipo ? ` otp__estado--${tipo}` : "");
    }
    function pop(c) {
      c.classList.remove("otp__casilla--pop");
      void c.offsetWidth; // reinicia la animación aunque se escriba el mismo dígito
      c.classList.add("otp__casilla--pop");
    }
    // Reparte dígitos desde la casilla i (sirve para escribir, pegar y el autocompletado del sistema).
    function llenar(i, digitos) {
      for (const d of digitos) {
        if (i >= largo) break;
        casillas[i].value = d;
        casillas[i].classList.add("otp__casilla--llena");
        pop(casillas[i]);
        i++;
      }
      casillas[Math.min(i, largo - 1)].focus();
      if (valor().length === largo) enviar(valor());
    }
    function limpiar() {
      casillas.forEach(c => { c.value = ""; c.classList.remove("otp__casilla--llena", "otp__casilla--pop"); c.disabled = false; });
      raiz.classList.remove("otp--error", "otp--ok", "otp--ocupado");
    }
    function enfocar() { (casillas.find(c => !c.value) || casillas[0]).focus(); }

    async function enviar(codigo) {
      if (ocupado) return;
      ocupado = true;
      raiz.classList.add("otp--ocupado");
      mensaje("Verificando…");
      let r;
      try { r = await alCompletar(codigo); } catch (err) { r = err.message || "No se pudo verificar el código."; }
      ocupado = false;
      raiz.classList.remove("otp--ocupado");
      if (r === true) {
        raiz.classList.add("otp--ok");
        document.activeElement?.blur();
        casillas.forEach(c => { c.disabled = true; });
        raiz.querySelector(".otp__cambiar")?.remove();
        estado.innerHTML = `${icono("ok", "icono--16")} Verificado`;
        estado.className = "otp__estado otp__estado--ok";
        return;
      }
      raiz.classList.remove("otp--error");
      void raiz.offsetWidth;
      raiz.classList.add("otp--error");
      mensaje(typeof r === "string" ? r : "El código no es correcto. Inténtalo de nuevo.", "error");
      setTimeout(() => { if (!raiz.classList.contains("otp--ok")) { limpiar(); casillas[0].focus(); } }, 650);
    }

    casillas.forEach((c, i) => {
      c.addEventListener("input", () => {
        const digitos = c.value.replace(/\D/g, "");
        c.value = "";
        if (digitos) llenar(i, digitos);
        else c.classList.remove("otp__casilla--llena");
      });
      c.addEventListener("keydown", e => {
        if (e.key === "Backspace" && !c.value && i > 0) {
          e.preventDefault();
          casillas[i - 1].value = "";
          casillas[i - 1].classList.remove("otp__casilla--llena");
          casillas[i - 1].focus();
        } else if (e.key === "ArrowLeft" && i > 0) { e.preventDefault(); casillas[i - 1].focus(); }
        else if (e.key === "ArrowRight" && i < largo - 1) { e.preventDefault(); casillas[i + 1].focus(); }
      });
      c.addEventListener("paste", e => {
        const digitos = (e.clipboardData?.getData("text") || "").replace(/\D/g, "");
        if (!digitos) return;
        e.preventDefault();
        llenar(digitos.length >= largo ? 0 : i, digitos);
      });
      c.addEventListener("focus", () => c.select());
    });

    if (alternativo) {
      const form = raiz.querySelector(".otp__alterno");
      const cambiar = raiz.querySelector(".otp__cambiar");
      cambiar.addEventListener("click", () => {
        const usarAlterno = form.hidden;
        form.hidden = !usarAlterno;
        raiz.querySelector(".otp__casillas").hidden = usarAlterno;
        cambiar.textContent = usarAlterno ? "Usar el código de 6 dígitos" : "Usar un código de recuperación";
        mensaje("");
        (usarAlterno ? form.querySelector("input") : casillas[0]).focus();
      });
      form.addEventListener("submit", async e => {
        e.preventDefault();
        const texto = form.querySelector("input").value.trim();
        if (!texto) return mensaje("Escribe uno de tus códigos de recuperación.", "error");
        let r;
        try { r = await alCompletar(texto); } catch (err) { r = err.message; }
        if (r === true) mensaje("Verificado", "ok");
        else mensaje(typeof r === "string" ? r : "El código no es correcto.", "error");
      });
    }

    return { limpiar, enfocar, valor, mensaje };
  }

  return { montar };
})();
