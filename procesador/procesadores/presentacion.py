"""PowerPoint / ODP → una lámina por diapositiva: imagen renderizada + texto y notas."""
from __future__ import annotations

import pymupdf
from pptx import Presentation

from comun import Trabajo, convertir_libreoffice, esc, ficha, resumen_de

MAX_DIAPOSITIVAS = 200


def _textos(pres) -> list[dict]:
    salida = []
    for diapo in pres.slides:
        titulo = ""
        if diapo.shapes.title is not None and diapo.shapes.title.has_text_frame:
            titulo = diapo.shapes.title.text_frame.text.strip()
        puntos = []
        for forma in diapo.shapes:
            if forma == diapo.shapes.title or not forma.has_text_frame:
                continue
            for p in forma.text_frame.paragraphs:
                texto = "".join(r.text for r in p.runs).strip()
                if texto:
                    puntos.append((p.level, texto))
        notas = ""
        if diapo.has_notes_slide and diapo.notes_slide.notes_text_frame is not None:
            notas = diapo.notes_slide.notes_text_frame.text.strip()
        salida.append({"titulo": titulo, "puntos": puntos, "notas": notas})
    return salida


def procesar(t: Trabajo) -> tuple[str, str]:
    textos: list[dict] = []
    if t.extension == "pptx":
        pptx_ruta = t.original
    else:
        pptx_ruta = convertir_libreoffice(t.original, "pptx")
    try:
        textos = _textos(Presentation(str(pptx_ruta)))
    except Exception:
        textos = []

    # Imagen de cada diapositiva: LibreOffice → PDF → PNG.
    pdf = pymupdf.open(convertir_libreoffice(t.original, "pdf"))
    total = pdf.page_count
    laminas = []
    texto_total = []
    for i in range(min(total, MAX_DIAPOSITIVAS)):
        nombre = f"diapos/d{i + 1:03d}.webp"
        pix = pdf[i].get_pixmap(dpi=96)
        t.ruta(nombre)
        pix.pil_save(t.ruta(nombre), format="WEBP", quality=82)
        info = textos[i] if i < len(textos) else {"titulo": "", "puntos": [], "notas": ""}
        titulo = info["titulo"] or f"Diapositiva {i + 1}"
        texto_total.append(titulo)
        texto_total.extend(p for _, p in info["puntos"])
        puntos = "".join(f'<li class="nivel-{min(n, 3)}">{esc(p)}</li>' for n, p in info["puntos"])
        notas = f'<details><summary>Notas del orador</summary><div>{esc(info["notas"])}</div></details>' if info["notas"] else ""
        laminas.append(f'''
          <section class="vista-diapo" id="d{i + 1}">
            <figure class="vista-diapo__imagen"><img src="{t.recurso(nombre)}" alt="Diapositiva {i + 1}: {esc(titulo)}" loading="lazy"></figure>
            <div class="vista-diapo__texto">
              <p class="rotulo">Diapositiva {i + 1:02d} / {total:02d}</p>
              <h2>{esc(titulo)}</h2>
              {f"<ul>{puntos}</ul>" if puntos else ""}
              {notas}
            </div>
          </section>''')

    t.datos.update(diapositivas=total)
    nav = '<nav class="vista-indice" aria-label="Diapositivas"><p class="rotulo">Diapositivas</p><ol>' + "".join(
        f'<li><a href="#d{i + 1}">{esc((textos[i]["titulo"] if i < len(textos) else "") or f"Diapositiva {i + 1}")[:70]}</a></li>'
        for i in range(min(total, MAX_DIAPOSITIVAS))) + "</ol></nav>"
    html = f'''<div class="vista-doc">
      <aside class="vista-lado">{ficha([("Formato", t.extension.upper()), ("Diapositivas", str(total))])}{nav}</aside>
      <article class="vista-diapos">{"".join(laminas)}</article>
    </div>'''
    return html, resumen_de(" · ".join(texto_total))
