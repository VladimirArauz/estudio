"""Lámina Estudio (apuntes, tareas, exámenes), Apoyo (materias por área) y la vista de cada archivo."""
from __future__ import annotations

import re

from playwright.sync_api import expect

from ayuda import sql
from e2e.conftest import api, correr_worker, entrar_ui, ir, requiere_root


def test_apoyo_muestra_las_83_materias_por_area(pagina):
    ir(pagina, "index.html#apoyo")
    expect(pagina.locator("#tarjetas .pieza")).to_have_count(83)
    areas = pagina.locator("#tarjetas h3.rotulo").all_inner_texts()
    assert [a.split(" · ")[0].lower() for a in areas] == [x.lower() for x in ["Tronco común", "Técnico en Programación", "Técnico en Mecatrónica",
                                                    "Técnico en Sistemas Digitales", "Técnico en Desarrollo de Software"]]
    assert pagina.locator("#filtroMateria optgroup").count() == 5


def test_pagina_de_materia_y_postulacion(pagina, nuevo_usuario):
    entrar_ui(pagina, nuevo_usuario("profesor"))
    ir(pagina, "materia.html?m=fisica")
    expect(pagina.locator("h1")).to_contain_text("Física")
    for vista in ["vistaMaterial", "vistaCursos", "vistaAsesores"]:
        pagina.click(f'[data-vista="{vista}"]')
        expect(pagina.locator(f"#{vista}")).to_be_visible()
    pagina.click('[data-vista="vistaCursos"]')
    pagina.click("#accionesProfesor >> text=Postularme")
    pagina.fill("#mensajePostular", "Doy clases de física desde hace 3 años.")
    pagina.click("#formPostular [type=submit]")
    expect(pagina.locator("#accionesProfesor")).to_contain_text("en revisión")


@requiere_root
def test_subir_procesar_ver_y_borrar_apunte(pagina, otra_pagina, nuevo_usuario):
    autora, otro = nuevo_usuario("alumno"), nuevo_usuario("alumno")
    entrar_ui(pagina, autora)
    ir(pagina, "index.html#estudio")
    for seccion in ["tareas", "examenes", "apuntes"]:
        pagina.click(f'#pestanasEstudio [data-seccion="{seccion}"]')
        expect(pagina.locator(f'#pestanasEstudio [data-seccion="{seccion}"]')).to_have_attribute("aria-selected", "true")
    pagina.click("#subirEstudio")
    dialogo = pagina.locator("dialog[open]")
    dialogo.locator("#subirArchivo").set_input_files({"name": "leyes.txt", "mimeType": "text/plain",
                                                      "buffer": "Primera ley de Newton: inercia.\n<b>no es html</b>".encode()})
    dialogo.locator("#subirTitulo").fill("Leyes de Newton")
    dialogo.locator("#subirMateria").select_option(label="Física")
    dialogo.locator("[type=submit]").click()
    expect(dialogo).to_be_hidden()
    tarjeta = pagina.locator("#piezasEstudio .pieza", has_text="Leyes de Newton")
    expect(tarjeta).to_be_visible()

    correr_worker()
    ir(pagina, "index.html#estudio")
    pagina.select_option("#filtroMateria", label="Física")
    expect(tarjeta).to_be_visible()
    tarjeta.locator("a", has_text=re.compile("Ver|Abrir|Leer", re.I)).first.click()
    pagina.wait_for_url(re.compile(r".*/ver\.html\?id=\d+"))
    expect(pagina.locator("#vista")).to_contain_text("Primera ley de Newton")
    expect(pagina.locator("#vista")).to_contain_text("<b>no es html</b>")  # se muestra como texto
    id_archivo = int(re.search(r"id=(\d+)", pagina.url).group(1))

    # Otra persona lo ve pero no puede borrarlo.
    entrar_ui(otra_pagina, otro)
    ir(otra_pagina, "index.html#estudio")
    expect(otra_pagina.locator("#piezasEstudio .pieza", has_text="Leyes de Newton").locator("[data-borrar-archivo]")).to_have_count(0)
    assert api(otro).post("api/archivos.php", {"id": id_archivo}, "borrar").status_code == 403

    # La autora sí.
    ir(pagina, "index.html#estudio")
    pagina.locator("#piezasEstudio .pieza", has_text="Leyes de Newton").locator("[data-borrar-archivo]").click()
    expect(pagina.locator("#piezasEstudio .pieza", has_text="Leyes de Newton")).to_have_count(0)
    assert not sql(f"SELECT id FROM archivos WHERE id = {id_archivo}")


@requiere_root
def test_vista_de_cada_tipo_de_archivo(pagina, nuevo_usuario):
    from seguridad.test_procesador import docx, mp4, pdf, png, pptx, subir, wav, xlsx
    import tempfile
    from pathlib import Path
    u = nuevo_usuario("profesor")
    c = api(u)
    tmp = Path(tempfile.mkdtemp())
    archivos = {
        "Apuntes PDF": ("a.pdf", pdf(), "application/pdf", "Cinemática"),
        "Química DOCX": ("q.docx", docx(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "H2O"),
        "Newton PPTX": ("n.pptx", pptx(), "application/vnd.openxmlformats-officedocument.presentationml.presentation", "Newton"),
        "Notas XLSX": ("x.xlsx", xlsx(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Física"),
        "Foto PNG": ("f.png", png(), "image/png", None),
        "Audio WAV": ("s.wav", wav(), "audio/wav", None),
        "Video MP4": ("v.mp4", mp4(tmp), "video/mp4", None),
    }
    ids = {}
    for titulo, (nombre, datos, mime, _) in archivos.items():
        r = c.s.post(c.url("api/subir.php"), headers={"X-CSRF": c.csrf}, data={"seccion": "apuntes", "titulo": titulo},
                     files={"archivo": (nombre, datos, mime)})
        assert r.status_code == 201, r.text
        ids[titulo] = r.json()["archivo"]["id"]
    correr_worker()
    entrar_ui(pagina, u)
    for titulo, (_, _, _, texto) in archivos.items():
        ir(pagina, f"ver.html?id={ids[titulo]}")
        expect(pagina.locator("h1")).to_contain_text(titulo)
        vista = pagina.locator("#vista")
        expect(vista.locator("[data-esqueleto]")).to_have_count(0)
        expect(vista).not_to_have_attribute("aria-busy", "true")
        if texto:
            expect(vista).to_contain_text(texto)
        if titulo.startswith("Foto"):
            expect(vista.locator("img").first).to_be_visible()
        if titulo.startswith("Audio"):
            expect(vista.locator("audio")).to_have_count(1)
        if titulo.startswith("Video"):
            expect(vista.locator("video")).to_have_count(1)
