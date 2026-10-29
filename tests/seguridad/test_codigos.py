"""Códigos de verificación por correo o SMS: verificar el contacto, segundo paso al entrar y recuperar la contraseña."""
from __future__ import annotations

import re
import time

from ayuda import CONTRASENA, Cliente, buzon, preparar, sql, totp, ultimo_codigo

TELEFONO = "+525512345678"


def enviar(c: Cliente, proposito: str = "verificar_correo"):
    return c.post("api/auth.php", {"proposito": proposito}, "codigo_enviar")


def verificar(c: Cliente, codigo: str, proposito: str = "verificar_correo"):
    return c.post("api/auth.php", {"proposito": proposito, "codigo": codigo}, "codigo_verificar")


def otro_codigo(codigo: str) -> str:
    return f"{(int(codigo) + 1) % 1_000_000:06d}"


def confirmar(c: Cliente):
    assert c.post("api/auth.php", {"password": CONTRASENA}, "confirmar").ok


# ───── Verificar el correo o el teléfono ─────

def test_codigo_verifica_el_correo_una_sola_vez(como, nuevo_usuario):
    u = nuevo_usuario("alumno", nuevo=True)
    c = como(u)
    r = enviar(c)
    assert r.ok and r.json()["destino"].endswith("@pruebas.test") and u["email"] not in r.text, "el destino va enmascarado"
    codigo = ultimo_codigo(u["email"])
    assert verificar(c, codigo).ok
    assert c.yo()["usuario"]["email_verificado"] is True
    assert enviar(c).status_code == 409, "un correo ya verificado no pide otro código"
    assert verificar(c, codigo).status_code == 422, "el código ya se usó"


def test_codigo_guardado_solo_como_hash(como, nuevo_usuario):
    u = nuevo_usuario("alumno")
    c = como(u)
    enviar(c)
    codigo = ultimo_codigo(u["email"])
    fila = sql(f"SELECT codigo_hash FROM codigos_verificacion WHERE usuario_id = {u['id']}")[0]
    assert len(fila["codigo_hash"]) == 64 and codigo not in fila["codigo_hash"]


def test_codigo_caduca(como, nuevo_usuario):
    u = nuevo_usuario("alumno")
    c = como(u)
    enviar(c)
    codigo = ultimo_codigo(u["email"])
    preparar("caducar", str(u["id"]))
    assert verificar(c, codigo).status_code == 422


def test_cinco_intentos_invalidan_el_codigo(como, nuevo_usuario):
    u = nuevo_usuario("alumno")
    c = como(u)
    enviar(c)
    codigo = ultimo_codigo(u["email"])
    for _ in range(5):
        assert verificar(c, otro_codigo(codigo)).status_code == 422
    assert verificar(c, codigo).status_code == 422, "tras 5 intentos el código correcto ya no sirve"


def test_espera_entre_envios(como, nuevo_usuario):
    u = nuevo_usuario("alumno")
    c = como(u)
    assert enviar(c).ok
    r = enviar(c)
    assert r.status_code == 429 and 0 < r.json()["reenviar_en"] <= 60
    assert len([m for m in buzon() if m["destino"] == u["email"]]) == 1


def test_reenviar_invalida_el_codigo_anterior(como, nuevo_usuario):
    u = nuevo_usuario("alumno")
    c = como(u)
    enviar(c)
    viejo = ultimo_codigo(u["email"])
    preparar("caducar", str(u["id"]))  # quita la espera (y vence el viejo, como haría el reenvío)
    enviar(c)
    nuevo = ultimo_codigo(u["email"])
    if viejo != nuevo:
        assert verificar(c, viejo).status_code == 422
    assert verificar(c, nuevo).ok


def test_limite_de_sms_por_cuenta(como, nuevo_usuario):
    u = nuevo_usuario("alumno", telefono=TELEFONO)
    c = como(u)
    for _ in range(3):
        assert enviar(c, "verificar_telefono").ok
        preparar("caducar", str(u["id"]))
    r = enviar(c, "verificar_telefono")
    assert r.status_code == 429 and "demasiados" in r.json()["error"]


def test_codigo_solo_para_el_telefono_al_que_se_mando(como, nuevo_usuario):
    u = nuevo_usuario("alumno", telefono=TELEFONO)
    c = como(u)
    enviar(c, "verificar_telefono")
    codigo = ultimo_codigo(TELEFONO)
    r = c.post("api/auth.php", {"telefono": "5587654321"}, "telefono_guardar")
    assert r.status_code == 428, "cambiar el teléfono pide confirmar la contraseña"
    confirmar(c)
    assert c.post("api/auth.php", {"telefono": "5587654321"}, "telefono_guardar").ok
    assert verificar(c, codigo, "verificar_telefono").status_code == 422
    assert sql(f"SELECT telefono FROM usuarios WHERE id = {u['id']}")[0]["telefono"] == "+525587654321"


def test_telefono_invalido(como, nuevo_usuario):
    c = como(nuevo_usuario("alumno"))
    for malo in ["123", "abcdefghij", "+0123", "55 1234 567"]:
        assert c.post("api/auth.php", {"telefono": malo}, "telefono_guardar").status_code == 422, malo


def test_registro_guarda_el_telefono_normalizado(cliente):
    correo = f"tel{time.time_ns()}@pruebas.test"
    r = cliente.post("api/auth.php", {"nombre": "Teo Prueba", "email": correo, "password": CONTRASENA, "telefono": "55 1234-5678"}, "registrar")
    assert r.status_code == 201 and r.json()["paso"] == "verificar"
    fila = sql(f"SELECT telefono, requiere_verificar FROM usuarios WHERE email = '{correo}'")[0]
    assert fila == {"telefono": TELEFONO, "requiere_verificar": 1}
    otro = Cliente()
    r = otro.post("api/auth.php", {"nombre": "Teo Prueba", "email": f"x{correo}", "password": CONTRASENA, "telefono": "12"}, "registrar")
    assert r.status_code == 422


def test_cuenta_nueva_sin_verificar_no_sube_ni_se_postula(como, nuevo_usuario):
    alumno = como(nuevo_usuario("alumno", nuevo=True))
    r = alumno.post("api/subir.php", {})
    assert r.status_code == 403 and r.json()["code"] == "VERIFICAR"
    profesor = como(nuevo_usuario("profesor", nuevo=True))
    r = profesor.post("api/cursos.php", {"materia_id": 1}, "postular")
    assert r.status_code == 403 and r.json()["code"] == "VERIFICAR"
    # Una cuenta anterior a la verificación no se bloquea.
    viejo = como(nuevo_usuario("alumno"))
    assert viejo.post("api/subir.php", {}).status_code == 422


def test_cuenta_nueva_verificada_ya_puede_subir(como, nuevo_usuario):
    u = nuevo_usuario("alumno", nuevo=True)
    c = como(u)
    enviar(c)
    assert verificar(c, ultimo_codigo(u["email"])).ok
    assert c.post("api/subir.php", {}).status_code == 422  # ya pasa el candado; falta el archivo


# ───── Segundo paso al entrar ─────

def test_segundo_paso_por_correo(como, nuevo_usuario):
    u = nuevo_usuario("alumno")
    c = como(u)
    r = c.post("api/auth.php", {"metodo": "correo"}, "segundo_factor")
    assert r.status_code == 409, "solo con el correo verificado"
    enviar(c)
    verificar(c, ultimo_codigo(u["email"]))
    assert c.post("api/auth.php", {"metodo": "correo"}, "segundo_factor").status_code == 428
    confirmar(c)
    assert c.post("api/auth.php", {"metodo": "correo"}, "segundo_factor").ok

    otro = Cliente()
    otro.yo()
    r = otro.post("api/auth.php", {"email": u["email"], "password": CONTRASENA}, "entrar")
    assert r.json()["paso"] == "2fa" and r.json()["metodo"] == "correo"
    assert otro.yo()["usuario"] is None, "sin el código todavía no hay sesión"
    codigo = ultimo_codigo(u["email"])
    assert otro.post("api/auth.php", {"codigo": otro_codigo(codigo)}, "verificar_2fa").status_code == 401
    assert otro.post("api/auth.php", {"codigo": codigo}, "verificar_2fa").ok
    assert otro.yo()["usuario"]["email"] == u["email"]


def test_segundo_paso_por_sms_requiere_telefono_verificado(como, nuevo_usuario):
    u = nuevo_usuario("alumno", telefono=TELEFONO)
    c = como(u)
    confirmar(c)
    assert c.post("api/auth.php", {"metodo": "sms"}, "segundo_factor").status_code == 409


def test_admin_solo_usa_la_app(como, nuevo_usuario):
    c = como(nuevo_usuario("admin", totp=True))
    r = c.post("api/auth.php", {"metodo": "correo"}, "segundo_factor")
    assert r.status_code == 403


def test_activar_la_app_apaga_el_codigo_por_correo(como, nuevo_usuario):
    u = nuevo_usuario("alumno")
    c = como(u)
    enviar(c)
    verificar(c, ultimo_codigo(u["email"]))
    confirmar(c)
    assert c.post("api/auth.php", {"metodo": "correo"}, "segundo_factor").ok
    secreto = c.post("api/auth.php", {}, "totp_iniciar").json()["secreto"]
    assert c.post("api/auth.php", {"codigo": totp(secreto)}, "totp_activar").ok
    assert sql(f"SELECT segundo_factor FROM usuarios WHERE id = {u['id']}")[0]["segundo_factor"] is None


# ───── Recuperar la contraseña ─────

def test_recuperar_responde_igual_exista_o_no(cliente, nuevo_usuario):
    u = nuevo_usuario("alumno")
    cliente.yo()

    def medir(email):
        t = time.perf_counter()
        r = cliente.post("api/auth.php", {"email": email}, "recuperar_enviar")
        return r, time.perf_counter() - t

    existe, t1 = medir(u["email"])
    no_existe, t2 = medir("nadie-recupera@pruebas.test")
    assert existe.status_code == no_existe.status_code == 200
    assert existe.json() == no_existe.json()
    assert abs(t1 - t2) < 0.25
    time.sleep(0.5)  # el envío ocurre después de responder
    assert ultimo_codigo(u["email"])
    assert not [m for m in buzon() if m["destino"] == "nadie-recupera@pruebas.test"]


def test_recuperar_cambia_la_contrasena_y_cierra_sesiones(como, nuevo_usuario, cliente):
    u = nuevo_usuario("alumno")
    version = sql(f"SELECT sesion_version FROM usuarios WHERE id = {u['id']}")[0]["sesion_version"]
    cliente.yo()
    assert cliente.post("api/auth.php", {"nueva": "otra-frase-larga-77"}, "recuperar_cambiar").status_code == 401
    cliente.post("api/auth.php", {"email": u["email"]}, "recuperar_enviar")
    time.sleep(0.5)
    codigo = ultimo_codigo(u["email"])
    assert cliente.post("api/auth.php", {"email": u["email"], "codigo": otro_codigo(codigo)}, "recuperar_verificar").status_code == 422
    assert cliente.post("api/auth.php", {"email": u["email"], "codigo": codigo}, "recuperar_verificar").ok
    assert cliente.post("api/auth.php", {"nueva": "corta"}, "recuperar_cambiar").status_code == 422
    assert cliente.post("api/auth.php", {"nueva": "otra-frase-larga-77"}, "recuperar_cambiar").ok
    assert cliente.yo()["usuario"] is None, "recuperar no inicia sesión"
    fila = sql(f"SELECT sesion_version, email_verificado IS NOT NULL v FROM usuarios WHERE id = {u['id']}")[0]
    assert fila["sesion_version"] == version + 1 and fila["v"] == 1
    assert Cliente().entrar(u).status_code == 401, "la contraseña anterior ya no sirve"
    assert Cliente().entrar({**u, "password": "otra-frase-larga-77"}).ok


def test_recuperar_con_codigo_de_otro_proposito_no_sirve(como, nuevo_usuario, cliente):
    u = nuevo_usuario("alumno")
    c = como(u)
    enviar(c)
    codigo = ultimo_codigo(u["email"])
    cliente.yo()
    assert cliente.post("api/auth.php", {"email": u["email"], "codigo": codigo}, "recuperar_verificar").status_code == 422


def test_los_codigos_no_aparecen_en_logs(como, nuevo_usuario):
    u = nuevo_usuario("alumno")
    c = como(u)
    enviar(c)
    codigo = ultimo_codigo(u["email"])
    logs = sql(f"SELECT accion, COALESCE(detalle, '') detalle FROM logs WHERE usuario_id = {u['id']}")
    assert any(l["accion"] == "codigo_enviado" for l in logs)
    assert not any(codigo in l["detalle"] for l in logs)
    assert not re.search(r"\b" + codigo + r"\b", c.yo().__repr__())
