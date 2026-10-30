"""Fixtures comunes: BD de pruebas limpia, límites vacíos y usuarios por rol."""
from __future__ import annotations

import uuid

import pytest

from ayuda import CONTRASENA, Cliente, preparar


@pytest.fixture(scope="session", autouse=True)
def bd_limpia():
    """Una BD de pruebas vacía (solo materias) para toda la corrida."""
    preparar("reiniciar")
    yield


@pytest.fixture(autouse=True)
def sin_limites():
    preparar("limites")
    yield


@pytest.fixture
def nuevo_usuario():
    """Fábrica: nuevo_usuario("alumno") / nuevo_usuario("admin", totp=True) /
    nuevo_usuario("alumno", nuevo=True) (recién registrada, sin verificar)."""
    def crear(rol: str = "alumno", totp: bool = False, nombre: str | None = None, nuevo: bool = False) -> dict:
        email = f"{rol}-{uuid.uuid4().hex[:10]}@pruebas.test"
        nombre = nombre or f"Persona {rol.title()} {uuid.uuid4().hex[:4]}"
        extras = (["2fa"] if totp else []) + (["nuevo"] if nuevo else [])
        d = preparar("usuario", rol, email, nombre, CONTRASENA, *extras)
        return {**d, "rol": rol, "nombre": nombre, "password": CONTRASENA}
    return crear


@pytest.fixture
def cliente():
    return Cliente()


@pytest.fixture
def como():
    """como(usuario) → Cliente con la sesión ya iniciada."""
    def entrar(usuario: dict) -> Cliente:
        c = Cliente()
        r = c.entrar(usuario)
        assert r.ok, r.text
        return c
    return entrar
