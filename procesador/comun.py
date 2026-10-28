"""Utilidades compartidas por los procesadores: rutas, HTML seguro y comandos externos."""
from __future__ import annotations

import html
import json
import os
import re
import shutil
import subprocess
import tempfile
import warnings
from dataclasses import dataclass, field
from pathlib import Path

import bleach
from PIL import Image

# Imágenes enormes (bombas de descompresión): Pillow las rechaza en lugar de agotar la memoria.
# Por defecto solo avisa hasta el doble del límite; aquí el aviso también es error.
Image.MAX_IMAGE_PIXELS = 60_000_000
warnings.simplefilter("error", Image.DecompressionBombWarning)

RAIZ = Path(__file__).resolve().parent.parent

ETIQUETAS = {
    "h2", "h3", "h4", "p", "br", "hr", "ul", "ol", "li", "strong", "em", "b", "i", "u", "s", "sub", "sup",
    "code", "pre", "span", "div", "section", "article", "aside", "header", "nav", "a", "img", "figure", "figcaption",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "blockquote", "audio", "video", "source",
    "track", "button", "details", "summary", "small", "mark", "dl", "dt", "dd",
}
ATRIBUTOS = {
    "*": ["class", "id", "aria-label", "title", "data-seek", "data-pagina"],
    "a": ["href"],
    "img": ["src", "alt", "width", "height", "loading"],
    "audio": ["src", "controls", "preload"],
    "video": ["src", "controls", "preload", "poster", "playsinline"],
    "source": ["src", "type"],
    "track": ["src", "kind", "srclang", "label", "default"],
    "th": ["scope", "colspan", "rowspan"],
    "td": ["colspan", "rowspan"],
    "ol": ["start"],
    "button": ["type"],
}


def esc(texto) -> str:
    return html.escape(str(texto if texto is not None else ""), quote=True)


def sanear(fragmento: str) -> str:
    return bleach.clean(fragmento, tags=ETIQUETAS, attributes=ATRIBUTOS, protocols=["http", "https", "mailto"], strip=True)


def texto_plano(fragmento: str) -> str:
    """Texto sin etiquetas, un bloque por línea (lo que lee la IA de las guías de examen)."""
    con_saltos = re.sub(r"(?i)<br\s*/?>|</(?:p|div|li|h[2-4]|tr|section|article|pre|blockquote|figcaption)>", "\n", fragmento)
    texto = html.unescape(bleach.clean(con_saltos, tags=set(), strip=True))
    lineas = (re.sub(r"[ \t\u00a0]+", " ", linea).strip() for linea in texto.splitlines())
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lineas)).strip()


@dataclass
class Trabajo:
    """Un archivo a procesar y la carpeta donde se escribe su vista."""
    id: int
    uuid: str
    titulo: str
    extension: str
    tipo: str
    mime: str
    original: Path
    salida: Path
    datos: dict = field(default_factory=dict)  # metadatos que se guardan en datos.json

    def recurso(self, nombre: str) -> str:
        """URL pública de un recurso generado (imagen, medio, miniatura)."""
        return f"api/archivo.php?id={self.id}&amp;modo=recurso&amp;r={nombre}"

    def ruta(self, nombre: str) -> Path:
        p = self.salida / nombre
        p.parent.mkdir(parents=True, exist_ok=True)
        return p


def ejecutar(cmd: list[str], tiempo: int = 1800) -> subprocess.CompletedProcess:
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=tiempo)
    if r.returncode != 0:
        raise RuntimeError(f"{Path(cmd[0]).name} falló: {r.stderr.strip()[-400:]}")
    return r


def convertir_libreoffice(origen: Path, formato: str) -> Path:
    """Convierte con LibreOffice (doc→docx, ppt→pdf, xls→xlsx…). Devuelve la ruta del resultado."""
    destino = Path(tempfile.mkdtemp(prefix="lo-"))
    perfil = Path(tempfile.mkdtemp(prefix="lo-perfil-"))
    try:
        ejecutar(["soffice", f"-env:UserInstallation=file://{perfil}", "--headless", "--norestore",
                  "--convert-to", formato, "--outdir", str(destino), str(origen)], tiempo=600)
    finally:
        shutil.rmtree(perfil, ignore_errors=True)
    resultados = list(destino.iterdir())
    if not resultados:
        raise RuntimeError(f"LibreOffice no pudo convertir el archivo a {formato}.")
    return resultados[0]


def ffprobe(ruta: Path) -> dict:
    r = ejecutar(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(ruta)], tiempo=120)
    return json.loads(r.stdout or "{}")


def reloj(segundos: float) -> str:
    s = int(segundos)
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60:02d}:{s % 60:02d}"


def resumen_de(texto: str, largo: int = 240) -> str:
    t = " ".join(texto.split())
    return t if len(t) <= largo else t[: largo - 1].rsplit(" ", 1)[0] + "…"


def ficha(filas: list[tuple[str, str]]) -> str:
    """Tabla de metadatos con el estilo del cajetín de plano."""
    cuerpo = "".join(f'<tr><th scope="row">{esc(k)}</th><td>{esc(v)}</td></tr>' for k, v in filas if v not in (None, ""))
    return f'<div class="tabla-caja"><table class="cajetin">{cuerpo}</table></div>'


def permisos(carpeta: Path) -> None:
    """Apache (grupo daemon) debe poder leer y borrar lo generado.

    El grupo daemon ya llega heredado (generados/ tiene setgid). No se pide el bit setgid aquí: el servicio
    corre con RestrictSUIDSGID=yes, que rechaza cualquier chmod que lo incluya.
    """
    for raiz, dirs, archivos in os.walk(carpeta):
        os.chmod(raiz, 0o775)
        for a in archivos:
            os.chmod(os.path.join(raiz, a), 0o664)
