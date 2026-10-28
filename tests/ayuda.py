"""Utilidades de las pruebas: entorno de pruebas (https://localhost:8443, BD local estudio_pruebas)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import struct
import subprocess
import time
import uuid
from pathlib import Path

import pytest
import requests

RAIZ = Path(__file__).resolve().parent.parent
BASE = os.environ.get("ESTUDIO_BASE", "https://localhost:8443/estudio/")
CA = os.environ.get("ESTUDIO_CA", str(Path("/home/aumf-ubuntu-080704/.local/share/mkcert/rootCA.pem")))
PHP = "/opt/lampp/bin/php"
COOKIE = "BATIZ_PRUEBAS"
CONTRASENA = "tren-nube-cactus-71"   # cumple la política (≥10, no común, sin nombre ni correo)


def preparar(*args: str):
    """Corre tests/herramientas/preparar.php contra la BD de pruebas y devuelve su JSON."""
    salida = subprocess.run([PHP, "tests/herramientas/preparar.php", *args], cwd=RAIZ, check=True,
                            capture_output=True, text=True, env={**os.environ, "ESTUDIO_ENTORNO": "pruebas"}).stdout
    return json.loads(salida)


def sql(consulta: str) -> list[dict]:
    return preparar("sql", consulta)


def totp(secreto: str, desfase: int = 0) -> str:
    """Código TOTP (RFC 6238) para el paso actual + desfase."""
    clave = base64.b32decode(secreto + "=" * (-len(secreto) % 8))
    paso = int(time.time()) // 30 + desfase
    h = hmac.new(clave, struct.pack(">Q", paso), hashlib.sha1).digest()
    o = h[19] & 0x0F
    return f"{(struct.unpack('>I', h[o:o + 4])[0] & 0x7FFFFFFF) % 1_000_000:06d}"


def esperar_paso_nuevo():
    """Espera al siguiente paso TOTP (un código no se puede usar dos veces)."""
    time.sleep(30 - time.time() % 30 + 1)


class Cliente:
    """Navegador mínimo: cookies, token CSRF y JSON."""

    def __init__(self):
        self.s = requests.Session()
        self.s.verify = CA
        self.csrf = None

    def url(self, ruta: str) -> str:
        return BASE + ruta

    def yo(self) -> dict:
        d = self.s.get(self.url("api/auth.php"), params={"accion": "yo"}).json()
        self.csrf = d["csrf"]
        return d

    def get(self, ruta: str, **params) -> requests.Response:
        return self.s.get(self.url(ruta), params=params)

    def post(self, ruta: str, datos: dict | None = None, accion: str | None = None, csrf: str | None = "auto", **kw) -> requests.Response:
        if csrf == "auto":
            if not self.csrf:
                self.yo()
            csrf = self.csrf
        cabeceras = {"X-CSRF": csrf} if csrf is not None else {}
        r = self.s.post(self.url(ruta), params={"accion": accion} if accion else None, json=datos or {}, headers=cabeceras, **kw)
        if r.headers.get("content-type", "").startswith("application/json"):
            nuevo = (r.json() or {}).get("csrf") if isinstance(r.json(), dict) else None
            if nuevo:
                self.csrf = nuevo
        return r

    def entrar(self, usuario: dict, codigo: str | None = None) -> requests.Response:
        self.yo()
        r = self.post("api/auth.php", {"email": usuario["email"], "password": usuario["password"]}, "entrar")
        if r.ok and r.json().get("paso") == "2fa":
            r = self.post("api/auth.php", {"codigo": codigo or totp(usuario["secreto"])}, "verificar_2fa")
        self.yo()
        return r
