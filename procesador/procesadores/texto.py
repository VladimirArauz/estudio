"""Texto, Markdown y código → lectura cómoda o código con resaltado."""
from __future__ import annotations

import markdown
from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import get_lexer_for_filename
from pygments.util import ClassNotFound

from comun import Trabajo, esc, ficha, resumen_de

MAX_BYTES = 2 * 1024 * 1024
CODIGO = {"py", "js", "java", "c", "cpp", "html", "css", "json", "sql"}


def procesar(t: Trabajo) -> tuple[str, str]:
    crudo = t.original.read_bytes()[:MAX_BYTES]
    for codificacion in ("utf-8", "latin-1"):
        try:
            texto = crudo.decode(codificacion)
            break
        except UnicodeDecodeError:
            continue
    lineas = texto.count("\n") + 1
    palabras = len(texto.split())

    if t.extension in CODIGO:
        try:
            lexer = get_lexer_for_filename(f"x.{t.extension}")
        except ClassNotFound:
            lexer = None
        cuerpo = highlight(texto, lexer, HtmlFormatter(linenos="table", cssclass="vista-codigo")) if lexer else f"<pre>{esc(texto)}</pre>"
        datos = ficha([("Lenguaje", lexer.name if lexer else t.extension), ("Líneas", str(lineas))])
        html = f'<div class="pila">{datos}<div class="tabla-caja">{cuerpo}</div></div>'
        return html, f"Código {lexer.name if lexer else t.extension} de {lineas} líneas."

    if t.extension == "md":
        cuerpo = markdown.markdown(texto, extensions=["tables", "fenced_code", "sane_lists", "toc"])
        # Los encabezados de nivel 1 bajan a 2: el h1 es el título de la página.
        cuerpo = cuerpo.replace("<h1", "<h2").replace("</h1>", "</h2>")
    else:
        parrafos = [p.strip() for p in texto.replace("\r\n", "\n").split("\n\n") if p.strip()]
        cuerpo = "".join(f"<p>{esc(p).replace(chr(10), '<br>')}</p>" for p in parrafos)

    datos = ficha([("Formato", t.extension.upper()), ("Palabras", str(palabras)), ("Lectura", f"{max(1, round(palabras / 200))} min")])
    html = f'<div class="vista-doc"><aside class="vista-lado">{datos}</aside><article class="vista-prosa">{cuerpo}</article></div>'
    return html, resumen_de(texto)
