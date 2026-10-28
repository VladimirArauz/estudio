"""Cabeceras, rutas privadas, CSRF, métodos HTTP, tamaño de peticiones y exposición de red."""
from __future__ import annotations

import re
import subprocess

import pytest
import requests

from ayuda import BASE, CA, Cliente

PRODUCCION = "https://localhost/estudio/"


@pytest.mark.parametrize("ruta", ["", "index.html", "api/salud.php", "api/auth.php?accion=yo"])
def test_cabeceras_de_seguridad(ruta):
    r = requests.get(BASE + ruta, verify=CA)
    h = {k.lower(): v for k, v in r.headers.items()}
    assert h["x-content-type-options"] == "nosniff"
    assert h["x-frame-options"] == "DENY"
    assert h["cross-origin-opener-policy"] == "same-origin"
    assert h["referrer-policy"] == "same-origin"
    csp = h["content-security-policy"]
    assert "script-src 'self'" in csp and "frame-ancestors 'none'" in csp and "object-src 'none'" in csp
    assert "unsafe-eval" not in csp and "script-src 'self' 'unsafe-inline'" not in csp
    assert h.get("server", "") == "Apache", "no debe anunciar versiones"
    assert "x-powered-by" not in h


def test_archivo_php_sirve_con_csp_sandbox(como, nuevo_usuario):
    c = como(nuevo_usuario("alumno"))
    r = c.s.post(c.url("api/subir.php"), headers={"X-CSRF": c.csrf}, data={"seccion": "apuntes"},
                 files={"archivo": ("x.txt", b"hola", "text/plain")})
    r = c.get("api/archivo.php", id=r.json()["archivo"]["id"])
    assert "sandbox" in r.headers["content-security-policy"] and "default-src 'none'" in r.headers["content-security-policy"]
    assert r.headers["content-disposition"].startswith("attachment")  # el texto se descarga, no se interpreta


def test_http_redirige_a_https():
    r = requests.get("http://localhost/estudio/login.html", allow_redirects=False)
    assert r.status_code == 308 and r.headers["location"].startswith("https://")


@pytest.mark.parametrize("ruta", [
    "config/config.php", "config/config.local.php", "../config/config.local.php", "src/comun.php", "src/db.php",
    "sql/001_esquema.sql", "storage/", "storage-pruebas/", "bin/tunel.sh", "procesador/worker.py", ".git/HEAD",
    "README.md", "api/.user.ini", "api/_comun.php", ".htaccess", "tests/conftest.py", "docs/servidor.md",
])
def test_rutas_privadas_no_se_sirven(ruta):
    r = requests.get(BASE + ruta, verify=CA, allow_redirects=False)
    assert r.status_code in (403, 404), (ruta, r.status_code)
    assert "<?php" not in r.text and "password" not in r.text.lower()


@pytest.mark.parametrize("metodo", ["PUT", "DELETE", "TRACE", "PATCH"])
def test_metodos_http_no_permitidos(metodo):
    r = requests.request(metodo, BASE + "api/auth.php", verify=CA)
    assert r.status_code in (403, 405)


# Todas las acciones POST: sin token CSRF válido se rechazan antes de hacer nada.
ACCIONES_POST = [
    ("auth.php", "entrar"), ("auth.php", "registrar"), ("auth.php", "salir"), ("auth.php", "cambiar_password"),
    ("auth.php", "confirmar"), ("auth.php", "verificar_2fa"), ("auth.php", "totp_iniciar"), ("auth.php", "totp_activar"),
    ("auth.php", "totp_desactivar"),
    ("materias.php", "crear"), ("materias.php", "editar"), ("materias.php", "borrar"),
    ("archivos.php", "borrar"), ("archivos.php", "reprocesar"), ("subir.php", None),
    ("ia.php", "generar"), ("ia.php", "guardar_intento"),
    ("admin.php", "usuario_rol"), ("admin.php", "usuario_estado"), ("admin.php", "usuario_password"),
    ("admin.php", "postulacion"), ("admin.php", "guia_area"),
    ("cursos.php", "postular"), ("cursos.php", "crear"), ("cursos.php", "editar"), ("cursos.php", "inscribir"),
    ("cursos.php", "baja"), ("cursos.php", "quitar_alumno"), ("cursos.php", "actividad_crear"), ("cursos.php", "actividad_borrar"),
    ("cursos.php", "entregar"), ("cursos.php", "calificar"), ("cursos.php", "examen_guardar"), ("cursos.php", "examen_publicar"),
    ("cursos.php", "examen_borrar"), ("cursos.php", "examen_responder"), ("cursos.php", "evaluar"),
]


@pytest.mark.parametrize("endpoint, accion", ACCIONES_POST)
def test_csrf_en_todas_las_acciones(como, nuevo_usuario, endpoint, accion):
    c = como(nuevo_usuario("admin", totp=True))  # con la sesión más poderosa: aun así, sin token no pasa
    for token in (None, "x" * 64):
        r = c.post("api/" + endpoint, {"id": 1}, accion, csrf=token)
        assert r.status_code == 419, (endpoint, accion, token, r.status_code, r.text[:200])


def test_visita_exige_token_de_la_sesion(cliente):
    cliente.yo()
    r = cliente.s.post(cliente.url("api/visita.php"), json={"vista_id": "a" * 32, "segundos": 5, "csrf": "otro"})
    assert r.status_code == 419


def test_json_enorme_se_rechaza(como, nuevo_usuario):
    c = como(nuevo_usuario("alumno"))
    r = c.post("api/ia.php", {"detalle": "x" * (2 * 1024 * 1024), "total": 1}, "guardar_intento")
    assert r.status_code == 413


def test_errores_no_filtran_detalles_internos(cliente):
    r = cliente.get("api/cursos.php", id="1' OR 1=1 -- ")
    assert r.status_code in (404, 422)
    assert not re.search(r"SQLSTATE|PDOException|/home/|\.php on line|Stack trace", r.text)


def test_red_solo_expone_lo_necesario():
    salida = subprocess.run(["ss", "-tlnH"], capture_output=True, text=True).stdout
    abiertos = {re.sub(r"^.*?(\S+):(\d+)\s.*$", r"\1:\2", l.split()[3] + " ") .strip() for l in salida.splitlines() if l.strip()}
    publicos = {a for a in abiertos if not a.startswith(("127.", "[::1]", "::1"))}
    for puerto in (":3306", ":21", ":3307", ":8443"):
        assert not any(a.endswith(puerto) for a in publicos), f"{puerto} escucha fuera de localhost: {publicos}"
    estado = subprocess.run(["ufw", "status"], capture_output=True, text=True).stdout
    assert "activo" in estado.lower() or "active" in estado.lower()


def test_produccion_tambien_tiene_las_cabeceras():
    """Comprobación de solo lectura sobre el sitio real."""
    r = requests.get(PRODUCCION, verify=CA)
    assert r.ok and "frame-ancestors 'none'" in r.headers["content-security-policy"] and r.headers["server"] == "Apache"
    cookie = requests.get(PRODUCCION + "api/auth.php?accion=yo", verify=CA).headers.get("set-cookie", "")
    assert "secure" in cookie.lower() and "httponly" in cookie.lower()


@pytest.mark.parametrize("ruta", ["scripts/", "noexiste.html", "api/"])
def test_csp_tambien_en_respuestas_de_error(ruta):
    """Regresión (ZAP): las respuestas 403/404 también deben llevar la CSP."""
    r = requests.get(BASE + ruta, verify=CA)
    assert r.status_code in (403, 404) and "frame-ancestors 'none'" in r.headers.get("content-security-policy", "")


def test_archivo_php_lleva_una_sola_csp(cliente):
    r = cliente.get("api/archivo.php", id=999999)
    assert r.headers.get("content-security-policy", "").count("default-src") == 1
