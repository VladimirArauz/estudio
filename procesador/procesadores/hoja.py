"""Excel / ODS / CSV → una tabla por hoja con pestañas."""
from __future__ import annotations

import csv
import datetime as dt

import openpyxl

from comun import Trabajo, convertir_libreoffice, esc, ficha

MAX_FILAS = 500
MAX_COLUMNAS = 40


def _celda(v) -> tuple[str, bool]:
    if v is None:
        return "", False
    if isinstance(v, bool):
        return ("Sí" if v else "No"), False
    if isinstance(v, (int, float)):
        texto = f"{v:,.2f}".rstrip("0").rstrip(".") if isinstance(v, float) else f"{v:,}"
        return texto.replace(",", " "), True
    if isinstance(v, (dt.datetime, dt.date)):
        return v.strftime("%d/%m/%Y"), False
    return str(v), False


def _tabla(filas: list[list]) -> str:
    if not filas:
        return "<p>La hoja está vacía.</p>"
    cabecera = "".join(f"<th>{esc(_celda(v)[0])}</th>" for v in filas[0])
    cuerpo = []
    for fila in filas[1:]:
        celdas = []
        for v in fila:
            texto, numero = _celda(v)
            celdas.append(f'<td class="num">{esc(texto)}</td>' if numero else f"<td>{esc(texto)}</td>")
        cuerpo.append("<tr>" + "".join(celdas) + "</tr>")
    return f'<div class="tabla-caja"><table class="tabla"><thead><tr>{cabecera}</tr></thead><tbody>{"".join(cuerpo)}</tbody></table></div>'


def procesar(t: Trabajo) -> tuple[str, str]:
    hojas: list[tuple[str, list[list], int]] = []
    if t.extension == "csv":
        with open(t.original, newline="", encoding="utf-8", errors="replace") as f:
            muestra = f.read(4096)
            f.seek(0)
            try:
                dialecto = csv.Sniffer().sniff(muestra, delimiters=",;\t|")
            except csv.Error:
                dialecto = csv.excel
            filas = [fila[:MAX_COLUMNAS] for fila in csv.reader(f, dialecto)]
        hojas.append(("CSV", filas[:MAX_FILAS + 1], len(filas)))
    else:
        ruta = t.original if t.extension == "xlsx" else convertir_libreoffice(t.original, "xlsx")
        libro = openpyxl.load_workbook(ruta, read_only=True, data_only=True)
        for hoja in libro.worksheets:
            filas = []
            total = 0
            for fila in hoja.iter_rows(values_only=True):
                total += 1
                if len(filas) <= MAX_FILAS:
                    filas.append(list(fila[:MAX_COLUMNAS]))
            # Quita columnas y filas vacías al final.
            while filas and all(v is None for v in filas[-1]):
                filas.pop()
            ancho = max((max((i + 1 for i, v in enumerate(f) if v is not None), default=0) for f in filas), default=0)
            hojas.append((hoja.title, [f[:ancho] for f in filas], total))

    pestanas = "".join(f'<a class="chip" href="#h{i + 1}">{esc(n)}</a>' for i, (n, _, _) in enumerate(hojas))
    secciones = []
    for i, (nombre, filas, total) in enumerate(hojas):
        aviso = f'<p class="rotulo">Se muestran {MAX_FILAS} de {total} filas</p>' if total > MAX_FILAS + 1 else ""
        secciones.append(f'<section id="h{i + 1}" class="pila"><h2>{esc(nombre)}</h2><p class="rotulo">{max(0, len(filas) - 1)} filas</p>{aviso}{_tabla(filas)}</section>')
    t.datos.update(hojas=len(hojas))
    html = f'''<div class="pila vista-hojas">
      {ficha([("Formato", t.extension.upper()), ("Hojas", str(len(hojas)))])}
      {f'<nav class="chips" aria-label="Hojas">{pestanas}</nav>' if len(hojas) > 1 else ""}
      {"".join(secciones)}
    </div>'''
    resumen = "Hojas: " + ", ".join(n for n, _, _ in hojas)
    return html, resumen
