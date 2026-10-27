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
    await API.post("auth.php", datos(), { accion });
    API.olvidarToken();
    const destino = new URLSearchParams(location.search).get("volver");
    // Solo se permite volver a una página propia (evita redirecciones a otros sitios).
    location.href = destino && /^[a-z]+\.html([?#][\w=&%#.-]*)?$/.test(destino) ? destino : "index.html";
  } catch (err) {
    error.textContent = err.message;
    boton.disabled = false;
  }
}

const esCorreo = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

formEntrar.addEventListener("submit", e => {
  e.preventDefault();
  enviar(formEntrar, "entrar",
    () => ({ email: document.getElementById("emailEntrar").value.trim(), password: document.getElementById("passEntrar").value }),
    [["emailEntrar", esCorreo, "Escribe tu correo completo, por ejemplo nombre@gmail.com."],
     ["passEntrar", v => v.length > 0, "Escribe tu contraseña."]]);
});

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
     ["passRegistro", v => v.length >= 8, "La contraseña debe tener al menos 8 caracteres."]]);
});
