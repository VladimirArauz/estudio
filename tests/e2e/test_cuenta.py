"""Registro, inicio de sesión, «Mi cuenta» (contraseña y verificación en dos pasos) y cierre de sesión."""
from __future__ import annotations

import re
import time

from playwright.sync_api import expect

from ayuda import CONTRASENA, totp, ultimo_codigo
from e2e.conftest import entrar_ui, escribir_codigo, ir


def test_registro_valida_y_crea_cuenta(pagina):
    ir(pagina, "login.html#registro")
    expect(pagina.locator("#formRegistro")).to_be_visible()
    pagina.fill("#nombreRegistro", "Lucía Prueba")
    correo = f"lucia{time.time_ns()}@pruebas.test"
    pagina.fill("#emailRegistro", correo)
    pagina.fill("#passRegistro", "corta")
    pagina.click("#formRegistro [type=submit]")
    expect(pagina.locator("#formRegistro .form__mensaje")).to_contain_text("al menos 10")
    pagina.fill("#passRegistro", "password123!")
    pagina.click("#formRegistro [type=submit]")
    expect(pagina.locator("#formRegistro .form__mensaje")).to_contain_text("más usadas")
    pagina.fill("#passRegistro", CONTRASENA)
    pagina.click("#formRegistro [type=submit]")
    # Cuenta creada: pide verificar el correo con el código que llegó (buzón simulado).
    expect(pagina.locator("#verificar")).to_be_visible()
    expect(pagina.locator("#cajaVerificar")).to_contain_text("Te mandamos un código")
    escribir_codigo(pagina, "#codigoCorreo", ultimo_codigo(correo))
    expect(pagina.locator("#cajaVerificar .otp--ok")).to_be_visible()
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


# ───── Códigos por correo o SMS e input OTP ─────

def test_registro_con_telefono_verifica_por_sms(pagina):
    ir(pagina, "login.html#registro")
    pagina.fill("#nombreRegistro", "Sofía Prueba")
    pagina.fill("#emailRegistro", f"sofia{time.time_ns()}@pruebas.test")
    pagina.fill("#telRegistro", "55 8765 4321")
    pagina.fill("#passRegistro", CONTRASENA)
    pagina.click("#formRegistro [type=submit]")
    pagina.click("#cajaVerificar [data-p=verificar_telefono]")
    expect(pagina.locator("#cajaVerificar")).to_contain_text("por SMS al •••• 4321")
    escribir_codigo(pagina, "#codigoTelefono", ultimo_codigo("+525587654321"))
    pagina.wait_for_url(re.compile(r".*/index\.html"))
    ir(pagina, "login.html")
    expect(pagina.locator("#contacto")).to_contain_text("•••• 4321")
    expect(pagina.locator("#contacto .chip--ok")).to_have_count(1)


def test_codigo_incorrecto_en_rojo_y_pegar_el_codigo(pagina, nuevo_usuario):
    u = nuevo_usuario("alumno")
    entrar_ui(pagina, u)
    ir(pagina, "login.html")
    pagina.click('#contacto [data-verificar="verificar_correo"]')
    expect(pagina.locator("#contacto")).to_contain_text("Te mandamos un código")
    codigo = ultimo_codigo(u["email"])
    malo = f"{(int(codigo) + 1) % 1_000_000:06d}"
    casillas = pagina.locator("#codigoCorreo .otp__casilla")
    casillas.first.focus()
    pagina.keyboard.type(malo)  # dígito por dígito: avanza solo
    expect(pagina.locator("#contacto .otp--error")).to_be_visible()
    expect(pagina.locator("#contacto .otp__estado")).to_contain_text("no es correcto")
    expect(casillas.first).to_have_value("")  # se limpia sola
    # Pegar el código completo en cualquier casilla lo reparte y lo envía.
    casillas.nth(2).evaluate("""(el, codigo) => {
        const datos = new DataTransfer(); datos.setData("text", codigo);
        el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: datos, bubbles: true, cancelable: true }));
    }""", codigo)
    expect(pagina.locator("#contacto .otp--ok")).to_be_visible()
    expect(pagina.locator("#contacto")).to_contain_text("Verificado")


def test_entrar_con_codigo_por_correo(pagina, nuevo_usuario, como):
    u = nuevo_usuario("alumno")
    c = como(u)
    c.post("api/auth.php", {"proposito": "verificar_correo"}, "codigo_enviar")
    c.post("api/auth.php", {"proposito": "verificar_correo", "codigo": ultimo_codigo(u["email"])}, "codigo_verificar")
    c.post("api/auth.php", {"password": CONTRASENA}, "confirmar")
    assert c.post("api/auth.php", {"metodo": "correo"}, "segundo_factor").ok
    ir(pagina, "login.html")
    pagina.fill("#emailEntrar", u["email"])
    pagina.fill("#passEntrar", CONTRASENA)
    pagina.click("#formEntrar [type=submit]")
    expect(pagina.locator("#formCodigo")).to_contain_text("Te mandamos un código de 6 dígitos a")
    escribir_codigo(pagina, "#codigoEntrar", ultimo_codigo(u["email"]))
    pagina.wait_for_url(re.compile(r".*/index\.html"))


def test_recuperar_contrasena(pagina, nuevo_usuario):
    u = nuevo_usuario("alumno")
    ir(pagina, "login.html")
    pagina.fill("#emailEntrar", u["email"])
    pagina.click("#olvide")
    expect(pagina.locator("#emailRecuperar")).to_have_value(u["email"])
    pagina.click("#formRecuperar [type=submit]")
    expect(pagina.locator("#cajaRecuperar")).to_contain_text("Si hay una cuenta con ese correo")
    pagina.wait_for_timeout(500)  # el envío ocurre después de responder
    escribir_codigo(pagina, "#codigoRecuperar", ultimo_codigo(u["email"]))
    pagina.fill("#passRecuperar", "frase-nueva-de-prueba-8")
    pagina.click("#cajaRecuperar [type=submit]")
    expect(pagina.locator("#formEntrar .form__mensaje--ok")).to_contain_text("tu contraseña cambió")
    pagina.fill("#passEntrar", "frase-nueva-de-prueba-8")
    pagina.click("#formEntrar [type=submit]")
    pagina.wait_for_url(re.compile(r".*/index\.html"))
