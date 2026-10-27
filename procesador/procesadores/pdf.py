"""PDF → lectura por secciones con índice, imágenes extraídas y folio de página."""
from __future__ import annotations

import re
import statistics
from pathlib import Path

import pymupdf

from comun import Trabajo, esc, ficha, resumen_de

MAX_PAGINAS = 400
MIN_LADO_IMAGEN = 120  # px; ignora iconos y adornos
# Viñetas comunes, incluidas las de la fuente Symbol/Wingdings (área privada U+F0xx).
VINETA = re.compile(r"^\s*(?:[-•◦▪▫‣∙●○■□➢➤►]\s*|[-–—*·]\s+)")


def _texto_linea(linea: dict) -> tuple[str, float, bool]:
    spans = [s for s in linea["spans"] if s["text"].strip()]
    if not spans:
        return "", 0, False
    texto = "".join(s["text"] for s in linea["spans"])
    tam = max(s["size"] for s in spans)
    negrita = all(("bold" in s["font"].lower()) or (s["flags"] & 16) for s in spans)
    return texto.strip(), tam, negrita


def _enlazar(texto: str) -> str:
    return re.sub(r"(https?://[^\s<]+)", r'<a href="\1">\1</a>', esc(texto))


def procesar(t: Trabajo, documento: pymupdf.Document | None = None, etiqueta: str = "PDF") -> tuple[str, str]:
    doc = documento or pymupdf.open(t.original)
    paginas = min(doc.page_count, MAX_PAGINAS)

    # Tamaño de letra dominante → lo que sea bastante mayor se toma como título.
    tamanos = []
    for i in range(min(paginas, 30)):
        for b in doc[i].get_text("dict")["blocks"]:
            for l in b.get("lines", []):
                txt, tam, _ = _texto_linea(l)
                if txt:
                    tamanos.extend([round(tam, 1)] * len(txt))
    base = statistics.mode(tamanos) if tamanos else 11

    cuerpo: list[str] = []
    indice: list[tuple[int, str, str]] = []
    texto_total: list[str] = []
    imagenes = 0
    vistas_escaneadas = 0

    for n in range(paginas):
        pagina = doc[n]
        cuerpo.append(f'<p class="vista-folio" id="pag-{n + 1}" data-pagina="{n + 1}">Pág. {n + 1:02d} / {paginas:02d}</p>')
        bloques = pagina.get_text("dict", sort=True)["blocks"]
        texto_pagina = pagina.get_text().strip()

        if len(texto_pagina) < 20:
            # Página escaneada o solo imagen: se muestra renderizada.
            pix = pagina.get_pixmap(dpi=110)
            nombre = f"paginas/p{n + 1:03d}.png"
            pix.save(t.ruta(nombre))
            cuerpo.append(f'<figure class="vista-figura"><img src="{t.recurso(nombre)}" alt="Página {n + 1}" loading="lazy"></figure>')
            vistas_escaneadas += 1
            continue

        parrafo: list[str] = []
        en_lista = False
        esperando_item = False  # la viñeta vino sola y su texto llega en la línea siguiente

        def cerrar_parrafo():
            nonlocal en_lista
            if parrafo:
                texto_p = _enlazar(" ".join(parrafo))
                cuerpo.append(f"<li>{texto_p}</li>" if en_lista else f"<p>{texto_p}</p>")
                parrafo.clear()

        def cerrar_lista():
            nonlocal en_lista
            cerrar_parrafo()
            if en_lista:
                cuerpo.append("</ul>")
                en_lista = False

        for b in bloques:
            if b["type"] == 1:  # imagen
                if b["width"] >= MIN_LADO_IMAGEN and b["height"] >= MIN_LADO_IMAGEN and imagenes < 200:
                    ext = b.get("ext", "png")
                    if ext not in ("png", "jpg", "jpeg"):
                        continue
                    imagenes += 1
                    nombre = f"img/i{imagenes:03d}.{ext}"
                    t.ruta(nombre).write_bytes(b["image"])
                    cerrar_lista()
                    cuerpo.append(f'<figure class="vista-figura"><img src="{t.recurso(nombre)}" alt="Figura {imagenes} de la página {n + 1}" loading="lazy"></figure>')
                continue
            for l in b.get("lines", []):
                txt, tam, negrita = _texto_linea(l)
                if not txt:
                    continue
                texto_total.append(txt)
                es_titulo = len(txt) < 120 and (tam >= base * 1.35 or (negrita and tam >= base * 1.1 and len(txt) < 80))
                vineta = VINETA.match(txt)
                if es_titulo:
                    cerrar_lista()
                    nivel = 2 if tam >= base * 1.6 else 3
                    ancla = f"s{len(indice) + 1}"
                    indice.append((nivel, ancla, txt))
                    cuerpo.append(f'<h{nivel} id="{ancla}">{esc(txt)}</h{nivel}>')
                elif vineta:
                    # Cada viñeta abre un elemento de lista nuevo.
                    cerrar_parrafo()
                    if not en_lista:
                        cuerpo.append("<ul>")
                        en_lista = True
                    resto = txt[vineta.end():].strip()
                    if resto:
                        parrafo.append(resto)
                    esperando_item = not resto
                else:
                    # Texto normal después de una viñeta ya cerrada: termina la lista.
                    if en_lista and not parrafo and not esperando_item:
                        cerrar_lista()
                    esperando_item = False
                    # Une palabras cortadas con guion al final de línea.
                    if parrafo and parrafo[-1].endswith("-"):
                        parrafo[-1] = parrafo[-1][:-1] + txt
                    else:
                        parrafo.append(txt)
            # Un párrafo solo termina en un cambio de bloque si la frase está completa.
            if parrafo and re.search(r"[.:;!?»”)]$", parrafo[-1]):
                cerrar_parrafo()
        cerrar_lista()

    meta = doc.metadata or {}
    t.datos.update(paginas=doc.page_count, imagenes=imagenes, escaneadas=vistas_escaneadas)
    nav = ""
    if indice:
        nav = '<nav class="vista-indice" aria-label="Índice del documento"><p class="rotulo">Índice</p><ol>' + "".join(
            f'<li class="nivel-{nivel}"><a href="#{ancla}">{esc(txt[:90])}</a></li>' for nivel, ancla, txt in indice[:80]) + "</ol></nav>"
    aviso = ""
    if doc.page_count > MAX_PAGINAS:
        aviso = f'<div class="nota nota--aviso"><p class="rotulo">Nota</p><p>Se muestran las primeras {MAX_PAGINAS} de {doc.page_count} páginas. Descarga el original para verlo completo.</p></div>'
    if vistas_escaneadas:
        aviso += '<div class="nota"><p class="rotulo">Nota</p><p>Algunas páginas son imágenes escaneadas y se muestran tal cual.</p></div>'

    datos = ficha([
        ("Formato", etiqueta), ("Páginas", str(doc.page_count)), ("Título", meta.get("title")),
        ("Autor", meta.get("author")), ("Imágenes", str(imagenes) if imagenes else None),
    ])
    html = f'''<div class="vista-doc">
      <aside class="vista-lado">{datos}{nav}</aside>
      <article class="vista-prosa">{aviso}{"".join(cuerpo)}</article>
    </div>'''
    return html, resumen_de(" ".join(texto_total))
