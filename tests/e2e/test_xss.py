"""XSS almacenado: lo que escribe una persona se muestra como texto en todas las páginas, nunca se ejecuta."""
from __future__ import annotations

from playwright.sync_api import expect

from ayuda import Cliente, esperar_paso_nuevo, sql
from e2e.conftest import entrar_ui, ir

CARGA = '"><img src=x onerror="window.__xss=1"><script>window.__xss=1</script><svg onload="window.__xss=1">'


def sin_ejecucion(page, ruta):
    page.add_init_script("window.__xss = 0")
    ir(page, ruta)
    page.wait_for_timeout(800)
    assert page.evaluate("window.__xss") == 0, f"se ejecutó código en {ruta}"


def test_ningun_texto_de_usuario_se_ejecuta(pagina, nuevo_usuario):
    fisica = sql("SELECT id FROM materias WHERE slug = 'fisica'")[0]["id"]
    admin = nuevo_usuario("admin", totp=True)
    prof = nuevo_usuario("profesor", nombre="Profe " + CARGA)
    alumno = nuevo_usuario("alumno", nombre="Alumno " + CARGA)
    ca, cp, cl = Cliente(), Cliente(), Cliente()
    ca.entrar(admin), cp.entrar(prof), cl.entrar(alumno)

    # Sembrar la carga en cada campo de texto libre.
    assert ca.post("api/materias.php", {"nombre": "Materia " + CARGA, "descripcion": CARGA, "simbolo": "<b>"}, "crear").status_code == 201
    cp.post("api/cursos.php", {"materia_id": fisica, "mensaje": CARGA}, "postular")
    pid = sql(f"SELECT id FROM postulaciones_profesor WHERE usuario_id = {prof['id']}")[0]["id"]
    ca.post("api/admin.php", {"id": pid, "estado": "aprobada"}, "postulacion")
    curso = cp.post("api/cursos.php", {"materia_id": fisica, "titulo": "Curso " + CARGA, "descripcion": CARGA}, "crear").json()["id"]
    act = cp.post("api/cursos.php", {"curso_id": curso, "titulo": "Act " + CARGA, "descripcion": CARGA}, "actividad_crear").json()["id"]
    cp.post("api/cursos.php", {"curso_id": curso, "titulo": "Examen " + CARGA, "publicado": True,
                               "preguntas": [{"pregunta": CARGA, "opciones": [CARGA, "b"], "correcta": 0, "explicacion": CARGA, "tema": CARGA}]}, "examen_guardar")
    cl.post("api/cursos.php", {"curso_id": curso}, "inscribir")
    cl.post("api/cursos.php", {"actividad_id": act, "comentario": CARGA}, "entregar")
    cl.post("api/cursos.php", {"curso_id": curso, "estrellas_curso": 5, "estrellas_profesor": 5, "comentario": CARGA}, "evaluar")
    archivo = cl.s.post(cl.url("api/subir.php"), headers={"X-CSRF": cl.csrf}, data={"seccion": "apuntes", "titulo": "Apunte " + CARGA},
                        files={"archivo": (CARGA + ".txt", b"contenido normal", "text/plain")}).json()["archivo"]["id"]
    slug = sql("SELECT slug FROM materias WHERE nombre LIKE 'Materia %' ORDER BY id DESC LIMIT 1")[0]["slug"]

    # Recorrer cada página donde aparecen, como alumno, profesor y admin.
    entrar_ui(pagina, alumno)
    for ruta in ["index.html", "index.html#apoyo", f"materia.html?m={slug}", "materia.html?m=fisica", "cursos.html",
                 f"curso.html?id={curso}", f"curso.html?id={curso}#actividades", f"curso.html?id={curso}#examenes",
                 f"curso.html?id={curso}#evaluar", f"ver.html?id={archivo}", "login.html"]:
        sin_ejecucion(pagina, ruta)
    ir(pagina, "index.html")
    expect(pagina.locator("#piezasEstudio")).to_contain_text("Apunte \"><img src=x")  # visible como texto
    pagina.context.clear_cookies()
    entrar_ui(pagina, prof)
    for ruta in [f"curso.html?id={curso}#alumnos", f"curso.html?id={curso}#actividades", f"curso.html?id={curso}#resultados",
                 f"curso.html?id={curso}#estadisticas", f"curso.html?id={curso}#examenes", "cursos.html"]:
        sin_ejecucion(pagina, ruta)
    sin_ejecucion(pagina, f"curso.html?id={curso}#actividades")
    pagina.click("[data-ver-entregas]")
    pagina.wait_for_timeout(500)
    assert pagina.evaluate("window.__xss") == 0
    pagina.context.clear_cookies()
    esperar_paso_nuevo()  # el código TOTP de este paso ya lo usó el cliente de la API
    entrar_ui(pagina, admin)
    for s in ["resumen", "usuarios", "materias", "contenido", "postulaciones", "cursos", "logs"]:
        sin_ejecucion(pagina, f"panel.html#{s}")
    # La carga se ve como texto (escapada), no desaparece.
    ir(pagina, "panel.html#usuarios")
    expect(pagina.locator("#panelAdmin")).to_contain_text("<script>window.__xss=1</script>")
