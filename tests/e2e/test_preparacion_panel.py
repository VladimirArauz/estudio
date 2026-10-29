"""Preparación (generador de exámenes), panel de administración y diseño responsivo."""
from __future__ import annotations

import re

import pytest
from playwright.sync_api import expect

from ayuda import esperar_paso_nuevo, sql
from e2e.conftest import ANCHO_MOVIL, confirmar_identidad, correr_worker, entrar_ui, ir, requiere_root

AVISO = ".aviso-flotante"
MODOS = ["simulacro", "materia", "quiz", "ejercicios", "flashcards"]


# ───── Preparación ─────

def test_invitado_practica_con_el_banco_local(pagina):
    ir(pagina, "preparacion.html")
    expect(pagina.locator("#estadoIa")).to_contain_text("IA activa")
    pagina.click('[data-modo="quiz"]')
    pagina.click("#botonGenerar")
    expect(pagina.locator("#origen")).to_have_text("Banco local")
    expect(pagina.locator("#avisoOrigen")).to_contain_text("Inicia sesión")
    expect(pagina.locator("#contenedorExamen .pregunta").first).to_be_visible()


def test_los_cinco_modos_con_ia_y_desempeno(pagina, nuevo_usuario):
    entrar_ui(pagina, nuevo_usuario("alumno"))
    ir(pagina, "preparacion.html")
    for modo in MODOS:
        pagina.click(f'[data-modo="{modo}"]')
        if modo != "simulacro":
            pagina.select_option("#materia", "Física")
        pagina.fill("#tema", "cinemática")
        pagina.click("#botonGenerar")
        expect(pagina.locator("#origen")).to_have_text(re.compile("IA"))
        expect(pagina.locator("#contenedorExamen")).not_to_be_empty()
    # Resolver un quiz guarda el intento y aparece en «Mi desempeño».
    pagina.click('[data-modo="quiz"]')
    pagina.click("#botonGenerar")
    preguntas = pagina.locator("#contenedorExamen .pregunta")
    for i in range(preguntas.count()):
        preguntas.nth(i).locator("input[type=radio]").first.check()
    pagina.click("#contenedorExamen >> text=Calificar examen")
    expect(pagina.locator("#contenedorExamen .resultado")).to_be_visible()
    ir(pagina, "preparacion.html#desempeno")
    expect(pagina.locator("#contenidoDesempeno")).to_contain_text("Quiz rápido")


# ───── Panel de administración ─────

SECCIONES = ["resumen", "usuarios", "materias", "contenido", "postulaciones", "cursos", "examenes", "guias", "analitica", "logs"]


def test_panel_secciones_y_buscador(pagina, nuevo_usuario):
    admin = nuevo_usuario("admin", totp=True)
    nuevo_usuario("alumno", nombre="Zoe Buscable")
    entrar_ui(pagina, admin)
    ir(pagina, "panel.html")
    for s in SECCIONES:
        pagina.click(f'#pestanasPanel [data-vista="{s}"]')
        expect(pagina.locator(f'#pestanasPanel [data-vista="{s}"]')).to_have_attribute("aria-selected", "true")
        expect(pagina.locator("#panelAdmin [data-esqueleto]")).to_have_count(0)
        expect(pagina.locator("#panelAdmin")).not_to_have_attribute("aria-busy", "true")
        expect(pagina.locator("#panelAdmin")).not_to_contain_text("Ocurrió un error")

    # Regresión: un clic dentro de la sección no recarga ni cambia la URL; escribir conserva el foco y el texto.
    pagina.click('#pestanasPanel [data-vista="usuarios"]')
    expect(pagina.locator("#f_q")).to_be_visible()
    pagina.click("#panelAdmin table")
    assert "pagina=panel" not in pagina.url
    pagina.click("#f_q")
    pagina.keyboard.type("Zoe", delay=60)
    expect(pagina.locator("#panelAdmin tbody tr")).to_have_count(1)
    expect(pagina.locator("#panelAdmin tbody")).to_contain_text("Zoe Buscable")
    assert pagina.evaluate("document.activeElement.id") == "f_q"
    assert pagina.input_value("#f_q") == "Zoe"


def test_cambiar_rol_pide_confirmar_identidad(pagina, nuevo_usuario):
    admin = nuevo_usuario("admin", totp=True)
    alumno = nuevo_usuario("alumno", nombre="Rafa Ascenso")
    entrar_ui(pagina, admin)
    ir(pagina, "panel.html#usuarios")
    fila = pagina.locator("#panelAdmin tr", has_text="Rafa Ascenso")
    esperar_paso_nuevo()  # el código del login no se puede reutilizar
    fila.locator("[data-rol]").select_option("profesor")
    confirmar_identidad(pagina, admin)
    expect(pagina.locator(AVISO)).to_contain_text("Rol actualizado")
    assert sql(f"SELECT rol FROM usuarios WHERE id = {alumno['id']}")[0]["rol"] == "profesor"
    # Dentro de los 5 minutos ya no vuelve a pedirla.
    pagina.locator("#panelAdmin tr", has_text="Rafa Ascenso").locator("[data-estado]").click()
    expect(pagina.locator(AVISO)).to_contain_text("Cuenta suspendida")


@requiere_root
def test_guias_de_examen_se_usan_al_generar(pagina, nuevo_usuario):
    from seguridad.test_procesador import pdf
    admin = nuevo_usuario("admin", totp=True)
    entrar_ui(pagina, admin)
    ir(pagina, "panel.html#guias")
    pagina.click("[data-subir-guia]")
    dialogo = pagina.locator("dialog[open]")
    dialogo.locator("#subirArchivo").set_input_files({"name": "guia-fisica.pdf", "mimeType": "application/pdf", "buffer": pdf()})
    dialogo.locator("#subirTitulo").fill("Guía oficial de Física")
    dialogo.locator("#subirExtra_area_examen").select_option("Física")
    dialogo.locator("[type=submit]").click()
    expect(dialogo).to_be_hidden()
    correr_worker()
    ir(pagina, "panel.html#guias")
    fila = pagina.locator("#panelAdmin tr", has_text="Guía oficial de Física")
    expect(fila).to_contain_text("Listo")
    expect(fila).to_contain_text("caracteres")
    ir(pagina, "preparacion.html")
    expect(pagina.locator("#estadoIa")).to_contain_text("1 guía")
    pagina.click('[data-modo="quiz"]')
    pagina.select_option("#materia", "Física")
    pagina.fill("#tema", "cinemática")
    pagina.click("#botonGenerar")
    expect(pagina.locator("#avisoOrigen")).to_contain_text("Guía oficial de Física")
    # La guía no es pública: un alumno no la puede abrir.
    gid = sql("SELECT id FROM archivos WHERE seccion = 'guia'")[0]["id"]
    from e2e.conftest import api
    assert api(nuevo_usuario("alumno")).get("api/archivo.php", id=gid).status_code == 404


# ───── Responsivo ─────

@pytest.mark.parametrize("ruta", ["index.html", "materia.html?m=fisica", "preparacion.html", "login.html", "cursos.html", "panel.html"])
def test_sin_scroll_horizontal_en_movil(pagina_movil, ruta):
    ir(pagina_movil, ruta)
    pagina_movil.wait_for_timeout(500)
    ancho = pagina_movil.evaluate("document.documentElement.scrollWidth")
    assert ancho <= ANCHO_MOVIL, f"{ruta}: {ancho}px de ancho en un teléfono de {ANCHO_MOVIL}px"
