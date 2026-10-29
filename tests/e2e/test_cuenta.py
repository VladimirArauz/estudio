"""Registro, inicio de sesión, «Mi cuenta» (contraseña y verificación en dos pasos) y cierre de sesión."""
from __future__ import annotations

import re
import time

from playwright.sync_api import expect

from ayuda import CONTRASENA, totp
from e2e.conftest import entrar_ui, escribir_codigo, ir


def test_registro_valida_y_crea_cuenta(pagina):
    ir(pagina, "login.html#registro")
    expect(pagina.locator("#formRegistro")).to_be_visible()
    pagina.fill("#nombreRegistro", "Lucía Prueba")
    pagina.fill("#emailRegistro", f"lucia{time.time_ns()}@pruebas.test")
    pagina.fill("#passRegistro", "corta")
    pagina.click("#formRegistro [type=submit]")
    expect(pagina.locator("#formRegistro .form__mensaje")).to_contain_text("al menos 10")
    pagina.fill("#passRegistro", "password123!")
    pagina.click("#formRegistro [type=submit]")
    expect(pagina.locator("#formRegistro .form__mensaje")).to_contain_text("más usadas")
    pagina.fill("#passRegistro", CONTRASENA)
    pagina.click("#formRegistro [type=submit]")
    pagina.wait_for_url(re.compile(r".*/index\.html"))
    ir(pagina, "login.html")
    expect(pagina.locator("#cuentaDatos")).to_contain_text("Lucía Prueba")


def test_login_incorrecto_muestra_error(pagina, nuevo_usuario):
    u = nuevo_usuario("alumno")
    ir(pagina, "login.html")
    pagina.fill("#emailEntrar", u["email"])
    pagina.fill("#passEntrar", "no-es-la-buena-1")
    pagina.click("#formEntrar [type=submit]")
    expect(pagina.locator("#formEntrar .form__mensaje")).to_contain_text("no coinciden")


def test_volver_solo_a_paginas_propias(pagina, nuevo_usuario):
    entrar_ui(pagina, nuevo_usuario("alumno"), volver="preparacion.html")
    assert pagina.url.endswith("/preparacion.html")
    pagina.context.clear_cookies()
    u = nuevo_usuario("alumno")
    ir(pagina, "login.html?volver=https://ejemplo-malicioso.test/robo")
    pagina.fill("#emailEntrar", u["email"])
    pagina.fill("#passEntrar", u["password"])
    pagina.click("#formEntrar [type=submit]")
    pagina.wait_for_url(re.compile(r"https://localhost:8443/estudio/index\.html"))


def test_cambiar_contrasena_y_salir(pagina, nuevo_usuario):
    u = nuevo_usuario("profesor")
    entrar_ui(pagina, u)
    ir(pagina, "login.html")
    pagina.fill("#passActual", u["password"])
    pagina.fill("#passNueva", "luna-roja-volcan-88")
    pagina.click("#formPassword [type=submit]")
    expect(pagina.locator("#formPassword .form__mensaje")).to_contain_text("tu contraseña cambió")
    # Cerrar sesión desde el índice lateral (en escritorio se abre al pasar por el borde izquierdo).
    pagina.hover(".nav-gatillo")
    pagina.click("#cerrarSesion")
    pagina.wait_for_url(re.compile(r".*/index\.html"))
    ir(pagina, "login.html")
    expect(pagina.locator("#formEntrar")).to_be_visible()


def test_admin_activa_2fa_desde_mi_cuenta(pagina, nuevo_usuario):
    admin = nuevo_usuario("admin")
    entrar_ui(pagina, admin)
    # Sin 2FA el panel no carga y ofrece activarlo.
    ir(pagina, "panel.html")
    expect(pagina.locator("#panelAdmin")).to_contain_text("verificación en dos pasos")
    pagina.click("#panelAdmin >> text=Activar en «Mi cuenta»")
    pagina.wait_for_url(re.compile(r".*/login\.html"))
    expect(pagina.locator("#dosPasos")).to_contain_text("Obligatoria")
    pagina.click("#dosPasos [data-iniciar]")
    expect(pagina.locator("#dosPasos svg")).to_be_visible()  # código QR
    secreto = pagina.locator("#dosPasos code").inner_text().replace(" ", "")
    escribir_codigo(pagina, "#codigoActivar", totp(secreto))
    expect(pagina.locator("#dosPasos")).to_contain_text("Guarda estos códigos")
    assert pagina.locator("#dosPasos ul li").count() == 10
    pagina.click("#dosPasos [data-listo]")
    expect(pagina.locator("#dosPasos")).to_contain_text("Al entrar te pediremos un código")
    ir(pagina, "panel.html")
    expect(pagina.locator("#panelAdmin .kpis")).to_be_visible()
