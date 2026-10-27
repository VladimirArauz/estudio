"""Cualquier otro archivo (zip…) → ficha con metadatos y, si es zip, su contenido."""
from __future__ import annotations

import zipfile

from comun import Trabajo, esc, ficha


def procesar(t: Trabajo) -> tuple[str, str]:
    tamano = t.original.stat().st_size
    contenido = ""
    if zipfile.is_zipfile(t.original):
        with zipfile.ZipFile(t.original) as z:
            nombres = [i for i in z.infolist() if not i.is_dir()]
        filas = "".join(f'<tr><td>{esc(i.filename)}</td><td class="num">{i.file_size:,}</td></tr>'.replace(",", " ") for i in nombres[:300])
        contenido = f'''<section class="pila"><p class="rotulo">Contenido del ZIP · {len(nombres)} archivos</p>
          <div class="tabla-caja"><table class="tabla"><thead><tr><th>Archivo</th><th class="num">Bytes</th></tr></thead><tbody>{filas}</tbody></table></div></section>'''
    html = f'<div class="pila">{ficha([("Formato", t.extension.upper()), ("Tipo", t.mime), ("Tamaño", f"{tamano / 1024:.0f} KB")])}{contenido}</div>'
    return html, f"Archivo {t.extension.upper()}."
