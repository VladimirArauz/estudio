"""Word / ODT / RTF → secciones con índice, listas, tablas e imágenes en el orden original."""
from __future__ import annotations

import re

import docx
from docx.document import Document as DocumentoWord
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

from comun import Trabajo, convertir_libreoffice, esc, ficha, resumen_de


def _nivel_titulo(p: Paragraph) -> int | None:
    nombre = (p.style.name if p.style is not None else "") or ""
    if nombre in ("Title", "Título", "Titulo"):
        return 2
    m = re.match(r"(Heading|Título|Titulo|Encabezado)\s*(\d)", nombre, re.I)
    if m:
        return min(4, int(m.group(2)) + 1)
    return None


def _es_lista(p: Paragraph) -> str | None:
    nombre = (p.style.name if p.style is not None else "").lower()
    tiene_num = p._p.pPr is not None and p._p.pPr.numPr is not None
    if "number" in nombre or "numer" in nombre:
        return "ol"
    if tiene_num or "list" in nombre or "lista" in nombre or "bullet" in nombre or "viñeta" in nombre:
        return "ul"
    return None


def _runs(p: Paragraph) -> str:
    partes = []
    for r in p.runs:
        texto = esc(r.text)
        if not texto:
            continue
        if r.bold:
            texto = f"<strong>{texto}</strong>"
        if r.italic:
            texto = f"<em>{texto}</em>"
        if r.underline:
            texto = f"<u>{texto}</u>"
        partes.append(texto)
    return "".join(partes)


def _imagenes(p: Paragraph, doc: DocumentoWord, t: Trabajo, contador: list[int]) -> list[str]:
    salida = []
    for blip in p._p.iter(qn("a:blip")):
        rid = blip.get(qn("r:embed"))
        parte = doc.part.related_parts.get(rid) if rid else None
        if parte is None or not getattr(parte, "content_type", "").startswith("image/"):
            continue
        ext = parte.content_type.split("/")[-1].replace("jpeg", "jpg")
        if ext not in ("png", "jpg", "gif", "webp"):
            continue
        contador[0] += 1
        nombre = f"img/i{contador[0]:03d}.{ext}"
        t.ruta(nombre).write_bytes(parte.blob)
        salida.append(f'<figure class="vista-figura"><img src="{t.recurso(nombre)}" alt="Imagen {contador[0]} del documento" loading="lazy"></figure>')
    return salida


def _tabla(tabla: Table) -> str:
    filas = []
    for i, fila in enumerate(tabla.rows):
        celdas = []
        vistas = set()
        for c in fila.cells:
            if id(c._tc) in vistas:  # celdas combinadas se repiten
                continue
            vistas.add(id(c._tc))
            etiqueta = "th" if i == 0 else "td"
            celdas.append(f"<{etiqueta}>{esc(c.text.strip())}</{etiqueta}>")
        filas.append("<tr>" + "".join(celdas) + "</tr>")
    if not filas:
        return ""
    return f'<div class="tabla-caja"><table class="tabla"><thead>{filas[0]}</thead><tbody>{"".join(filas[1:])}</tbody></table></div>'


def procesar(t: Trabajo) -> tuple[str, str]:
    ruta = t.original
    etiqueta = t.extension.upper()
    if t.extension != "docx":
        ruta = convertir_libreoffice(t.original, "docx")

    doc = docx.Document(str(ruta))
    cuerpo: list[str] = []
    indice: list[tuple[int, str, str]] = []
    texto_total: list[str] = []
    lista_abierta: str | None = None
    imagenes = [0]
    tablas = 0

    def cerrar_lista():
        nonlocal lista_abierta
        if lista_abierta:
            cuerpo.append(f"</{lista_abierta}>")
            lista_abierta = None

    for hijo in doc.element.body.iterchildren():
        if hijo.tag == qn("w:tbl"):
            cerrar_lista()
            tablas += 1
            cuerpo.append(_tabla(Table(hijo, doc)))
            continue
        if hijo.tag != qn("w:p"):
            continue
        p = Paragraph(hijo, doc)
        cuerpo.extend(_imagenes(p, doc, t, imagenes))
        texto = p.text.strip()
        if not texto:
            continue
        texto_total.append(texto)
        nivel = _nivel_titulo(p)
        if nivel:
            cerrar_lista()
            ancla = f"s{len(indice) + 1}"
            indice.append((nivel, ancla, texto))
            cuerpo.append(f'<h{nivel} id="{ancla}">{esc(texto)}</h{nivel}>')
            continue
        tipo_lista = _es_lista(p)
        if tipo_lista:
            if lista_abierta != tipo_lista:
                cerrar_lista()
                cuerpo.append(f"<{tipo_lista}>")
                lista_abierta = tipo_lista
            cuerpo.append(f"<li>{_runs(p) or esc(texto)}</li>")
            continue
        cerrar_lista()
        cuerpo.append(f"<p>{_runs(p) or esc(texto)}</p>")
    cerrar_lista()

    palabras = len(" ".join(texto_total).split())
    props = doc.core_properties
    t.datos.update(palabras=palabras, imagenes=imagenes[0], tablas=tablas, secciones=len(indice))
    nav = ""
    if indice:
        nav = '<nav class="vista-indice" aria-label="Índice del documento"><p class="rotulo">Índice</p><ol>' + "".join(
            f'<li class="nivel-{n}"><a href="#{a}">{esc(x[:90])}</a></li>' for n, a, x in indice[:80]) + "</ol></nav>"
    datos = ficha([
        ("Formato", etiqueta), ("Palabras", f"{palabras:,}".replace(",", " ")),
        ("Lectura", f"{max(1, round(palabras / 200))} min"), ("Autor", props.author),
        ("Secciones", str(len(indice)) if indice else None), ("Tablas", str(tablas) if tablas else None),
        ("Imágenes", str(imagenes[0]) if imagenes[0] else None),
    ])
    html = f'''<div class="vista-doc">
      <aside class="vista-lado">{datos}{nav}</aside>
      <article class="vista-prosa">{"".join(cuerpo) or "<p>El documento no tiene texto.</p>"}</article>
    </div>'''
    return html, resumen_de(" ".join(texto_total))
