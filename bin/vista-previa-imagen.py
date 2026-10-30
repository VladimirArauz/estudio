"""Genera public/img/vista-previa.png (1200×630): la imagen que muestran WhatsApp y las redes al compartir un enlace.

Usa Chrome (Playwright del entorno de pruebas) para dibujarla con las mismas fuentes y colores del sitio.
Uso: tests/.venv/bin/python bin/vista-previa-imagen.py
"""
from __future__ import annotations

import os
from pathlib import Path

from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "public" / "img" / "vista-previa.png"

# Todo el texto va en el centro: WhatsApp a veces recorta la imagen en cuadrado.
PLANTILLA = """<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@900&family=Schibsted+Grotesk:wght@500&family=JetBrains+Mono:wght@600&display=block" rel="stylesheet">
<style>
  :root { --bg: #071530; --fg: #E9EEF8; --fg-2: #A9B6D3; --acento: #F6C200; --sombra: #000; }
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; overflow: hidden; background: var(--bg); color: var(--fg);
         display: grid; place-items: center; text-align: center;
         background-image: linear-gradient(rgba(120,160,230,.13) 1px, transparent 1px), linear-gradient(90deg, rgba(120,160,230,.13) 1px, transparent 1px),
                           linear-gradient(rgba(120,160,230,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(120,160,230,.07) 1px, transparent 1px);
         background-size: 120px 120px, 120px 120px, 24px 24px, 24px 24px; background-position: center; }
  .caja { display: grid; justify-items: center; gap: 24px; }
  .rotulo { font: 600 20px/1 "JetBrains Mono", monospace; letter-spacing: .14em; text-transform: uppercase; color: var(--fg-2); }
  h1 { font: 900 112px/.98 "Big Shoulders Display", sans-serif; text-transform: uppercase; letter-spacing: -.01em; }
  h1 span { display: block; }
  .marcador { position: relative; display: inline-block; z-index: 0; }
  .marcador::after { content: ""; position: absolute; left: -.04em; right: -.04em; bottom: .04em; height: .32em; background: var(--acento); z-index: -1; }
  p.frase { font: 500 28px/1.3 "Schibsted Grotesk", sans-serif; color: var(--fg); max-width: 600px; }
  .sello { display: inline-block; padding: 10px 18px; background: var(--acento); color: var(--bg); box-shadow: 5px 5px 0 var(--sombra);
           font: 600 20px/1 "JetBrains Mono", monospace; letter-spacing: .1em; text-transform: uppercase; }
</style></head>
<body><div class="caja">
  <p class="rotulo">CECyT 9 «Juan de Dios Bátiz» · IPN</p>
  <h1><span>Bátiz hasta la</span><span class="marcador">muerte</span></h1>
  <p class="frase">Apuntes, tareas, exámenes y preparación para tu examen, en un solo lugar.</p>
  <span class="sello">Estudio · Hecho por estudiantes</span>
</div></body></html>"""


def main() -> None:
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        navegador = p.chromium.launch(channel="chrome", headless=True, args=["--no-sandbox"] if os.geteuid() == 0 else [])
        pagina = navegador.new_page(viewport={"width": 1200, "height": 630})
        pagina.set_content(PLANTILLA, wait_until="networkidle")
        pagina.evaluate("document.fonts.ready")
        pagina.screenshot(path=str(SALIDA))
        navegador.close()
    print(f"Listo: {SALIDA.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
