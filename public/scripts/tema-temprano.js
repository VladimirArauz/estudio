// Se carga en <head> para aplicar el tema guardado antes de pintar (evita parpadeo).
(function () {
  var raiz = document.documentElement;
  raiz.classList.add("js");
  try {
    var tema = localStorage.getItem("tema");
    if (tema === "light" || tema === "dark") raiz.dataset.theme = tema;
  } catch (e) { /* almacenamiento bloqueado: se usa el del sistema */ }
})();
