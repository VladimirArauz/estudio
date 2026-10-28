"""Inicio de sesión, contraseñas, verificación en dos pasos, sesiones y confirmación de identidad."""
from __future__ import annotations

import time

import pytest

from ayuda import COOKIE, CONTRASENA, Cliente, esperar_paso_nuevo, sql, totp


# ───── Inicio de sesión ─────

def test_login_correcto_regenera_la_sesion(cliente, nuevo_usuario):
    u = nuevo_usuario("alumno")
    cliente.yo()
    antes = cliente.s.cookies.get(COOKIE)
    assert cliente.entrar(u).ok
    assert cliente.s.cookies.get(COOKIE) != antes, "el ID de sesión debe cambiar al iniciar sesión (fijación de sesión)"
    assert cliente.yo()["usuario"]["email"] == u["email"]


def test_login_mensaje_igual_exista_o_no_el_correo(cliente, nuevo_usuario):
    u = nuevo_usuario("alumno")
    cliente.yo()
    malo = cliente.post("api/auth.php", {"email": u["email"], "password": "no-es-esta-123"}, "entrar")
    inexistente = cliente.post("api/auth.php", {"email": "nadie-xyz@pruebas.test", "password": "no-es-esta-123"}, "entrar")
    assert malo.status_code == inexistente.status_code == 401
    assert malo.json()["error"] == inexistente.json()["error"]


def test_login_tiempo_similar_exista_o_no_el_correo(cliente, nuevo_usuario):
    u = nuevo_usuario("alumno")
    cliente.yo()

    def medir(email):
        t = time.perf_counter()
        cliente.post("api/auth.php", {"email": email, "password": "no-es-esta-123"}, "entrar")
        return time.perf_counter() - t

    existe = min(medir(u["email"]) for _ in range(3))
    no_existe = min(medir("nadie-abc@pruebas.test") for _ in range(3))
    # password_verify corre siempre: la diferencia no debe delatar si la cuenta existe.
    assert abs(existe - no_existe) < 0.12, (existe, no_existe)


def test_limite_de_intentos_no_bloquea_a_otras_cuentas(nuevo_usuario):
    victima, otra = nuevo_usuario("alumno"), nuevo_usuario("alumno")
    atacante = Cliente()
    atacante.yo()
    codigos = [atacante.post("api/auth.php", {"email": victima["email"], "password": "mala-mala-123"}, "entrar").status_code for _ in range(8)]
    assert 429 in codigos, codigos
    assert Cliente().entrar(otra).ok, "otra cuenta debe poder entrar"


def test_csrf_obligatorio_en_login(cliente, nuevo_usuario):
    u = nuevo_usuario("alumno")
    cliente.yo()
    r = cliente.post("api/auth.php", {"email": u["email"], "password": u["password"]}, "entrar", csrf=None)
    assert r.status_code == 419
    r = cliente.post("api/auth.php", {"email": u["email"], "password": u["password"]}, "entrar", csrf="0" * 64)
    assert r.status_code == 419


def test_cookie_de_sesion_segura(cliente):
    r = cliente.get("api/auth.php", accion="yo")
    cookie = r.headers.get("set-cookie", "")
    assert COOKIE in cookie and "secure" in cookie.lower() and "httponly" in cookie.lower() and "samesite=lax" in cookie.lower(), cookie


# ───── Política de contraseñas ─────

@pytest.mark.parametrize("password, motivo", [
    ("corta123", "al menos 10"),
    ("password123!", "más usadas"),
    ("aaaaaaaaaaaa", "repite"),
])
def test_registro_rechaza_contrasenas_debiles(cliente, password, motivo):
    cliente.yo()
    r = cliente.post("api/auth.php", {"nombre": "Ana Prueba", "email": f"ana{time.time_ns()}@pruebas.test", "password": password}, "registrar")
    assert r.status_code == 422 and motivo in r.json()["error"], r.text


def test_registro_rechaza_contrasena_con_el_nombre(cliente):
    cliente.yo()
    r = cliente.post("api/auth.php", {"nombre": "Fernanda Prueba", "email": f"fer{time.time_ns()}@pruebas.test", "password": "fernanda-2026-x"}, "registrar")
    assert r.status_code == 422 and "nombre" in r.json()["error"]


def test_registro_no_permite_crear_admin(cliente):
    cliente.yo()
    r = cliente.post("api/auth.php", {"nombre": "Mal Intencionado", "email": f"x{time.time_ns()}@pruebas.test", "password": CONTRASENA, "rol": "admin"}, "registrar")
    assert r.status_code == 201 and r.json()["rol"] == "alumno"


# ───── Sesiones ─────

def test_cambiar_contrasena_cierra_las_otras_sesiones(nuevo_usuario):
    u = nuevo_usuario("alumno")
    a, b = Cliente(), Cliente()
    assert a.entrar(u).ok and b.entrar(u).ok
    nueva = "otra-frase-segura-42"
    assert a.post("api/auth.php", {"actual": u["password"], "nueva": nueva}, "cambiar_password").ok
    assert a.yo()["usuario"], "la sesión que cambió la contraseña sigue activa"
    time.sleep(61)  # usuario() relee la BD cada 60 s
    assert b.yo()["usuario"] is None, "las demás sesiones deben cerrarse"


def test_cerrar_sesion(como, nuevo_usuario):
    c = como(nuevo_usuario("alumno"))
    assert c.post("api/auth.php", {}, "salir").ok
    assert c.yo()["usuario"] is None


# ───── Verificación en dos pasos ─────

def test_admin_sin_2fa_no_usa_el_panel(como, nuevo_usuario):
    c = como(nuevo_usuario("admin"))
    r = c.get("api/admin.php", seccion="resumen")
    assert r.status_code == 403 and r.json()["code"] == "NECESITA_2FA"


def test_activar_2fa_y_entrar_con_codigo(nuevo_usuario):
    u = nuevo_usuario("admin")
    c = Cliente()
    assert c.entrar(u).ok
    ini = c.post("api/auth.php", {}, "totp_iniciar").json()
    assert ini["uri"].startswith("otpauth://totp/") and len(ini["secreto"]) == 32
    act = c.post("api/auth.php", {"codigo": totp(ini["secreto"])}, "totp_activar")
    assert act.ok, act.text
    recuperacion = act.json()["recuperacion"]
    assert len(recuperacion) == 10
    assert sql(f"SELECT totp_secreto FROM usuarios WHERE id = {u['id']}")[0]["totp_secreto"].startswith("v1:"), "el secreto se guarda cifrado"
    assert c.get("api/admin.php", seccion="resumen").ok

    # Nuevo inicio de sesión: la contraseña sola no basta.
    d = Cliente()
    d.yo()
    r = d.post("api/auth.php", {"email": u["email"], "password": u["password"]}, "entrar")
    assert r.json()["paso"] == "2fa" and d.yo()["usuario"] is None
    # El mismo código que ya se usó al activar no vale otra vez.
    assert d.post("api/auth.php", {"codigo": totp(ini["secreto"])}, "verificar_2fa").status_code == 401
    # Un código de recuperación sí, y solo una vez.
    assert d.post("api/auth.php", {"codigo": recuperacion[0]}, "verificar_2fa").ok
    assert d.yo()["usuario"]["email"] == u["email"]
    e = Cliente()
    e.yo()
    e.post("api/auth.php", {"email": u["email"], "password": u["password"]}, "entrar")
    assert e.post("api/auth.php", {"codigo": recuperacion[0]}, "verificar_2fa").status_code == 401


def test_codigo_2fa_incorrecto_tiene_limite(nuevo_usuario):
    u = nuevo_usuario("admin", totp=True)
    c = Cliente()
    c.yo()
    c.post("api/auth.php", {"email": u["email"], "password": u["password"]}, "entrar")
    codigos = [c.post("api/auth.php", {"codigo": "000000"}, "verificar_2fa").status_code for _ in range(8)]
    assert codigos[0] == 401 and 429 in codigos, codigos


def test_admin_no_puede_desactivar_2fa(como, nuevo_usuario):
    c = como(nuevo_usuario("admin", totp=True))
    assert c.post("api/auth.php", {}, "totp_desactivar").status_code == 403


# ───── Confirmar identidad en acciones delicadas ─────

def test_acciones_delicadas_piden_confirmar_contrasena(nuevo_usuario):
    admin = nuevo_usuario("admin", totp=True)
    alumno = nuevo_usuario("alumno")
    c = Cliente()
    assert c.entrar(admin).ok
    r = c.post("api/admin.php", {"id": alumno["id"], "estado": "suspendido"}, "usuario_estado")
    assert r.status_code == 428 and r.json()["code"] == "REAUTH"
    # Contraseña correcta sin código 2FA: no basta.
    assert c.post("api/auth.php", {"password": admin["password"]}, "confirmar").status_code == 403
    esperar_paso_nuevo()
    assert c.post("api/auth.php", {"password": admin["password"], "codigo": totp(admin["secreto"])}, "confirmar").ok
    assert c.post("api/admin.php", {"id": alumno["id"], "estado": "suspendido"}, "usuario_estado").ok
    # La cuenta suspendida ya no puede entrar.
    assert Cliente().entrar(alumno).status_code == 403


def test_restablecer_contrasena_ajena_cierra_su_sesion(nuevo_usuario):
    admin, alumno = nuevo_usuario("admin", totp=True), nuevo_usuario("alumno")
    sesion_alumno = Cliente()
    assert sesion_alumno.entrar(alumno).ok
    c = Cliente()
    assert c.entrar(admin).ok
    esperar_paso_nuevo()
    assert c.post("api/auth.php", {"password": admin["password"], "codigo": totp(admin["secreto"])}, "confirmar").ok
    r = c.post("api/admin.php", {"id": alumno["id"]}, "usuario_password")
    assert r.ok and len(r.json()["temporal"]) >= 14
    time.sleep(61)
    assert sesion_alumno.yo()["usuario"] is None


# ───── Límites y cuotas ─────

def test_ia_requiere_sesion(cliente):
    cliente.yo()
    r = cliente.post("api/ia.php", {"modo": "quiz", "materia": "Física"}, "generar")
    assert r.status_code == 401


def test_ia_con_sesion_funciona(como, nuevo_usuario):
    c = como(nuevo_usuario("alumno"))
    r = c.post("api/ia.php", {"modo": "quiz", "materia": "Física", "tema": "cinemática"}, "generar")
    assert r.ok and r.json()["ok"] and len(r.json()["datos"]["preguntas"]) == 5, r.text


def test_cuota_diaria_de_subidas(como, nuevo_usuario):
    u = nuevo_usuario("alumno")
    c = como(u)
    codigos = []
    for i in range(22):
        r = c.s.post(c.url("api/subir.php"), headers={"X-CSRF": c.csrf},
                     data={"seccion": "apuntes", "titulo": f"cuota {i}"}, files={"archivo": (f"n{i}.txt", b"hola " * 10, "text/plain")})
        codigos.append(r.status_code)
    assert codigos[:20] == [201] * 20 and codigos[20] == 429, codigos
