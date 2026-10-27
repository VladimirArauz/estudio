"""Imagen → visor con versión web optimizada y metadatos."""
from __future__ import annotations

from PIL import ExifTags, Image, ImageOps

from comun import Trabajo, esc, ficha

LADO_MAX = 2000


def procesar(t: Trabajo) -> tuple[str, str]:
    with Image.open(t.original) as im:
        formato = im.format
        ancho, alto = im.size
        exif = {}
        try:
            exif = {ExifTags.TAGS.get(k, k): v for k, v in im.getexif().items()}
        except Exception:
            pass
        im = ImageOps.exif_transpose(im)
        if getattr(im, "is_animated", False) and t.extension == "gif":
            # Los GIF animados se sirven tal cual (copia).
            t.ruta("web.gif").write_bytes(t.original.read_bytes())
            nombre = "web.gif"
        else:
            im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
            im.thumbnail((LADO_MAX, LADO_MAX))
            nombre = "web.webp"
            im.save(t.ruta(nombre), "WEBP", quality=85)

    t.datos.update(ancho=ancho, alto=alto)
    datos = ficha([
        ("Formato", formato or t.extension.upper()), ("Dimensiones", f"{ancho} × {alto} px"),
        ("Cámara", str(exif.get("Model", "")).strip() or None), ("Fecha", str(exif.get("DateTime", "")) or None),
    ])
    html = f'''<div class="vista-doc">
      <aside class="vista-lado">{datos}</aside>
      <figure class="vista-imagen"><a href="{t.recurso(nombre)}"><img src="{t.recurso(nombre)}" alt="{esc(t.titulo)}"></a>
        <figcaption class="rotulo">Toca la imagen para verla a tamaño completo</figcaption></figure>
    </div>'''
    return html, f"Imagen {ancho} × {alto} px."
