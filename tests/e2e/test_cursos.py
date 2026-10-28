"""Classroom completo: postulación aprobada → curso → actividad y examen → alumno se inscribe, entrega, resuelve y evalúa
→ profesor califica y ve alumnos, resultados y estadísticas."""
from __future__ import annotations

import re

from playwright.sync_api import expect

from ayuda import sql
from e2e.conftest import api, entrar_ui, ir

AVISO = ".aviso-flotante"


def test_flujo_completo_de_un_curso(pagina, otra_pagina, nuevo_usuario):
    profesor, alumno = nuevo_usuario("profesor"), nuevo_usuario("alumno")
    admin = nuevo_usuario("admin", totp=True)

    # Postulación (API) y aprobación del admin (API con 2FA).
    fisica = sql("SELECT id FROM materias WHERE slug = 'fisica'")[0]["id"]
    assert api(profesor).post("api/cursos.php", {"materia_id": fisica, "mensaje": "Quiero dar Física."}, "postular").status_code == 201
    pid = sql(f"SELECT id FROM postulaciones_profesor WHERE usuario_id = {profesor['id']}")[0]["id"]
    assert api(admin).post("api/admin.php", {"id": pid, "estado": "aprobada"}, "postulacion").ok

    # El profesor crea el curso desde la página de la materia.
    entrar_ui(pagina, profesor)
    ir(pagina, "materia.html?m=fisica")
    pagina.click('[data-vista="vistaCursos"]')
    pagina.click("#crearCurso")
    pagina.fill("#tituloCurso", "Física I · grupo de prueba")
    pagina.fill("#descripcionCurso", "Cinemática y dinámica.")
    pagina.click("#formCurso [type=submit]")
    pagina.wait_for_url(re.compile(r".*/curso\.html\?id=\d+"))
    curso_id = int(re.search(r"id=(\d+)", pagina.url).group(1))
    expect(pagina.locator("#encabezado")).to_contain_text("Física I · grupo de prueba")

    # Actividad.
    pagina.click('#pestanasCurso [data-vista="actividades"]')
    pagina.click("summary:has-text('Nueva actividad')")
    pagina.fill("#actTitulo", "Problemas de MRU")
    pagina.fill("#actDesc", "Resuelve los 5 problemas.")
    pagina.fill("#actPuntos", "10")
    pagina.click("#formActividad [type=submit]")
    expect(pagina.locator(AVISO)).to_contain_text("Actividad creada")
    expect(pagina.locator("#listaActividades")).to_contain_text("Problemas de MRU")

    # Examen generado con la IA (simulada en pruebas) y publicado.
    pagina.click('#pestanasCurso [data-vista="examenes"]')
    pagina.fill("#exTema", "MRU")
    pagina.fill("#exCantidad", "3")
    pagina.click("#formGenerarExamen [type=submit]")
    expect(pagina.locator("#borrador")).to_contain_text("3 preguntas")
    pagina.fill("#exTitulo", "Examen de MRU")
    pagina.click("#formGuardarExamen [type=submit]")
    expect(pagina.locator(AVISO)).to_contain_text("Examen guardado")
    expect(pagina.locator("table")).to_contain_text("Examen de MRU")

    # El alumno se inscribe, entrega, resuelve y evalúa.
    entrar_ui(otra_pagina, alumno)
    ir(otra_pagina, f"curso.html?id={curso_id}")
    otra_pagina.click("#inscribirme")
    otra_pagina.wait_for_load_state("load")
    expect(otra_pagina.locator("#encabezado")).to_contain_text("Inscrito")
    otra_pagina.click('#pestanasCurso [data-vista="actividades"]')
    otra_pagina.respuestas_prompt.append("Mi entrega: https://ejemplo.test/mru")
    otra_pagina.click("[data-entregar-texto]")
    expect(otra_pagina.locator(AVISO)).to_contain_text("Entrega registrada")

    otra_pagina.click('#pestanasCurso [data-vista="examenes"]')
    otra_pagina.click("[data-resolver]")
    preguntas = otra_pagina.locator("#contenedorExamen .pregunta")
    expect(preguntas).to_have_count(3)
    for i in range(3):
        preguntas.nth(i).locator("input[type=radio]").first.check()
    otra_pagina.click("#contenedorExamen >> text=Calificar examen")
    expect(otra_pagina.locator("#contenedorExamen .resultado")).to_contain_text("Aciertos")
    # Solo cuenta el primer intento.
    r = api(alumno).post("api/cursos.php", {"examen_id": sql(f"SELECT id FROM examenes WHERE curso_id = {curso_id}")[0]["id"], "respuestas": [0, 0, 0]}, "examen_responder")
    assert r.status_code == 409
    # El alumno nunca recibe las respuestas correctas al pedir el examen.
    cli = api(alumno)
    xid = sql(f"SELECT id FROM examenes WHERE curso_id = {curso_id}")[0]["id"]
    examen = cli.get("api/cursos.php", id=curso_id, seccion="examen", examen_id=xid).json()["examen"]
    assert all("correcta" not in p for p in examen["preguntas"])

    otra_pagina.click('#pestanasCurso [data-vista="evaluar"]')
    otra_pagina.click("label[for=ec5]")
    otra_pagina.click("label[for=ep4]")
    otra_pagina.fill("#evComentario", "Muy claro.")
    otra_pagina.click("#formEvaluar [type=submit]")
    expect(otra_pagina.locator(AVISO)).to_contain_text("Gracias por tu evaluación")
    expect(otra_pagina.locator("#panelCurso")).to_contain_text("Ya evaluaste este curso")

    # El profesor califica la entrega y revisa alumnos, resultados y estadísticas.
    ir(pagina, f"curso.html?id={curso_id}#actividades")
    pagina.click("[data-ver-entregas]")
    fila = pagina.locator("tr[data-entrega]").filter(has_text=alumno["nombre"])
    fila.locator("input[type=number]").fill("9")
    fila.locator("input[type=text]").fill("Bien resuelto.")
    fila.locator("[data-calificar]").click()
    expect(pagina.locator(AVISO)).to_contain_text("Calificación guardada")
    for vista, texto in [("alumnos", alumno["nombre"]), ("resultados", "Examen de MRU"), ("estadisticas", "Visitas")]:
        pagina.click(f'#pestanasCurso [data-vista="{vista}"]')
        expect(pagina.locator("#panelCurso")).to_contain_text(texto)


def test_profesor_no_ve_entregas_de_otro_curso(nuevo_usuario):
    """Regresión: la actividad debe pertenecer al curso indicado."""
    fisica = sql("SELECT id FROM materias WHERE slug = 'fisica'")[0]["id"]
    admin = nuevo_usuario("admin", totp=True)
    a = api(admin)
    p1, p2, alumno = nuevo_usuario("profesor"), nuevo_usuario("profesor"), nuevo_usuario("alumno")
    c1 = api(p1).post("api/cursos.php", {"materia_id": fisica, "titulo": "Curso uno"}, "crear")
    assert c1.status_code == 403  # sin postulación aprobada no puede abrir curso
    for p in (p1, p2):
        api(p).post("api/cursos.php", {"materia_id": fisica, "mensaje": "Postulo."}, "postular")
        pid = sql(f"SELECT id FROM postulaciones_profesor WHERE usuario_id = {p['id']}")[0]["id"]
        assert a.post("api/admin.php", {"id": pid, "estado": "aprobada"}, "postulacion").ok
    cli1, cli2, cal = api(p1), api(p2), api(alumno)
    curso1 = cli1.post("api/cursos.php", {"materia_id": fisica, "titulo": "Curso uno"}, "crear").json()["id"]
    curso2 = cli2.post("api/cursos.php", {"materia_id": fisica, "titulo": "Curso dos"}, "crear").json()["id"]
    act1 = cli1.post("api/cursos.php", {"curso_id": curso1, "titulo": "Tarea secreta"}, "actividad_crear").json()["id"]
    for c in (curso1, curso2):
        assert cal.post("api/cursos.php", {"curso_id": c}, "inscribir").ok
    assert cal.post("api/cursos.php", {"actividad_id": act1, "comentario": "respuesta privada"}, "entregar").ok
    # El profesor 2 pide las entregas de la actividad del curso 1 usando su propio curso.
    r = cli2.get("api/cursos.php", id=curso2, seccion="entregas", actividad_id=act1)
    assert r.ok and r.json()["entregas"] == []
    # Y directamente sobre el curso 1, no tiene permiso.
    assert cli2.get("api/cursos.php", id=curso1, seccion="entregas", actividad_id=act1).status_code == 403
