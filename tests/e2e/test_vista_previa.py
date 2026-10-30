"""Vista previa al compartir un enlace (Open Graph): cada página trae título, descripción e imagen de 1200×630."""
from __future__ import annotations

import re
import struct

import pytest
import requests

from ayuda import BASE, RAIZ

PAGINAS = sorted((RAIZ / "public").glob("*.html"))


@pytest.mark.parametrize("pagina", PAGINAS, ids=lambda p: p.name)
def test_pagina_trae_vista_previa(pagina):
    html = pagina.read_text(encoding="utf-8")
    for propiedad in ["og:title", "og:description", "og:image", "og:site_name"]:
        assert re.search(rf'<meta property="{propiedad}" content="[^"]+">', html), f"{pagina.name}: falta {propiedad}"
    assert re.search(r'<meta name="description" content="[^"]{50,}">', html), f"{pagina.name}: falta una descripción clara"
    assert '<meta name="twitter:card" content="summary_large_image">' in html


def test_imagen_de_1200_por_630():
    datos = (RAIZ / "public" / "img" / "vista-previa.png").read_bytes()
    assert datos[:8] == b"\x89PNG\r\n\x1a\n"
    assert struct.unpack(">II", datos[16:24]) == (1200, 630)
    r = requests.get(BASE + "img/vista-previa.png", verify=False, timeout=10)
    assert r.ok and r.headers["Content-Type"] == "image/png"
