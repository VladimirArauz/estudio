"""Pruebas de punta a punta en Chrome (Playwright) contra el entorno de pruebas.

Cada página registra errores de JavaScript, violaciones de CSP y respuestas 5xx; la prueba falla si aparece alguno.
"""
from __future__ import annotations

import os
import re
import subprocess

import pytest
from playwright.sync_api import Page, expect, sync_playwright

from ayuda import BASE, RAIZ, Cliente, totp

ANCHO_MOVIL = 375


@pytest.fixture(scope="session")
def navegador():
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=True, args=["--no-sandbox"] if os.geteuid() == 0 else [])
        yield b
        b.close()


def _pagina(navegador, **opciones) -> Page:
    ctx = navegador.new_context(ignore_https_errors=True, locale="es-MX", **opciones)
    # Pruebas herméticas: las fuentes de Google vienen de internet y, si tardan, retrasan el evento «load».
    ctx.route(re.compile(r"^https://fonts\.(googleapis|gstatic)\.com/"), lambda ruta: ruta.abort())
    page = ctx.new_page()
    page.set_default_timeout(15_000)
    page.errores = []
    # Las respuestas 4xx esperadas (contraseña mala, sin permiso…) Chrome las registra como «Failed to load resource»;
    # esas no cuentan. Los 5xx se vigilan aparte.
    page.on("console", lambda m: m.type == "error" and not m.text.startswith("Failed to load resource") and page.errores.append(m.text))
    page.on("pageerror", lambda e: page.errores.append(f"JS: {e}"))
    page.on("response", lambda r: r.status >= 500 and page.errores.append(f"{r.status} {r.url}"))
    page.add_init_script("document.addEventListener('securitypolicyviolation', e => console.error('CSP: ' + e.violatedDirective + ' ' + e.blockedURI))")
    # Diálogos nativos (confirm/prompt): por defecto se aceptan; una prueba puede poner page.respuestas_prompt.
    page.respuestas_prompt = []
    page.on("dialog", lambda d: d.accept(page.respuestas_prompt.pop(0)) if d.type == "prompt" and page.respuestas_prompt else d.accept())
    return page


@pytest.fixture
def pagina(navegador):
    page = _pagina(navegador, viewport={"width": 1366, "height": 900})
    yield page
    errores = list(page.errores)
    page.context.close()
    assert not errores, errores


@pytest.fixture
def otra_pagina(navegador):
    """Segunda persona en paralelo (otro contexto, otras cookies)."""
    page = _pagina(navegador, viewport={"width": 1366, "height": 900})
    yield page
    errores = list(page.errores)
    page.context.close()
    assert not errores, errores


@pytest.fixture
def pagina_movil(navegador):
    page = _pagina(navegador, viewport={"width": ANCHO_MOVIL, "height": 800}, is_mobile=True, has_touch=True)
    yield page
    errores = list(page.errores)
    page.context.close()
    assert not errores, errores


def ir(page: Page, ruta: str):
    page.goto(BASE + ruta)
    page.wait_for_load_state("load")


def entrar_ui(page: Page, usuario: dict, codigo: str | None = None, volver: str | None = None):
    """Inicia sesión por el formulario (con el paso del código si la cuenta tiene 2FA)."""
    ir(page, "login.html" + (f"?volver={volver}" if volver else ""))
    page.fill("#emailEntrar", usuario["email"])
    page.fill("#passEntrar", usuario["password"])
    page.click("#formEntrar [type=submit]")
    if usuario.get("secreto"):
        expect(page.locator("#formCodigo")).to_be_visible()
        escribir_codigo(page, "#codigoEntrar", codigo or totp(usuario["secreto"]))
    page.wait_for_url(re.compile(r".*/(index|" + re.escape((volver or "index.html").split(".")[0]) + r")\.html.*"))
    page.wait_for_load_state("load")


def escribir_codigo(page: Page, selector: str, codigo: str):
    """Escribe en el input OTP (una casilla por dígito; se envía solo al completar)."""
    page.locator(f"{selector} .otp__casilla").first.fill(codigo)


def confirmar_identidad(page: Page, usuario: dict, codigo: str | None = None):
    """Llena el diálogo «Confirma que eres tú» que abre una acción delicada."""
    dialogo = page.locator("dialog[open]").filter(has_text="Confirma que eres tú")
    expect(dialogo).to_be_visible()
    dialogo.locator("#reauthPass").fill(usuario["password"])
    if usuario.get("secreto"):
        dialogo.locator("#reauthCodigo").fill(codigo or totp(usuario["secreto"]))
    dialogo.locator("[type=submit]").click()
    expect(dialogo).to_be_hidden()


def correr_worker():
    """Procesa la cola de pruebas con el worker aislado (root: usa systemd-run)."""
    r = subprocess.run([str(RAIZ / "bin/worker-pruebas.sh")], capture_output=True, text=True, timeout=900)
    assert r.returncode == 0, r.stderr[-2000:]


def api(usuario: dict) -> Cliente:
    """Cliente HTTP con la sesión de esa persona (para preparar datos rápido)."""
    c = Cliente()
    assert c.entrar(usuario).ok
    return c


requiere_root = pytest.mark.skipif(os.geteuid() != 0, reason="el worker aislado se lanza con systemd-run (root)")
