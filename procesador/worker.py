"""Procesa los archivos subidos: genera storage/generados/{uuid}/contenido.html y datos.json.

Uso:
  procesador/.venv/bin/python procesador/worker.py           # bucle continuo
  procesador/.venv/bin/python procesador/worker.py --una-vez # procesa la cola y termina
  procesador/.venv/bin/python procesador/worker.py --id 12   # (re)procesa un archivo
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import signal
import zipfile
import subprocess
import sys
import time
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import pymysql  # noqa: E402

from comun import RAIZ, Trabajo, permisos, sanear, texto_plano  # noqa: E402
from procesadores import documento, hoja, imagen, medios, otro, pdf, presentacion, texto  # noqa: E402

PROCESADORES = {
    "pdf": pdf.procesar,
    "documento": documento.procesar,
    "presentacion": presentacion.procesar,
    "hoja": hoja.procesar,
    "texto": texto.procesar,
    "imagen": imagen.procesar,
    "audio": medios.procesar_audio,
    "video": medios.procesar_video,
    "otro": otro.procesar,
}
PHP = "/opt/lampp/bin/php"

# Tiempo máximo por archivo: un archivo malicioso o roto no debe dejar al worker colgado.
TIEMPO_MAX = {"audio": 2 * 3600, "video": 3 * 3600}
TIEMPO_MAX_OTROS = 15 * 60
# Office/OpenDocument son ZIP: se rechazan los que se inflan demasiado al descomprimir (zip bomb).
EXT_ZIP = {"docx", "pptx", "xlsx", "odt", "odp", "ods"}
MAX_DESCOMPRIMIDO = 500 * 1024 * 1024
MAX_PROPORCION = 200


class TiempoAgotado(Exception):
    pass


def _alarma(_senal, _marco):
    raise TiempoAgotado("El archivo tardó demasiado en procesarse y se canceló.")


def revisar_zip(ruta: Path) -> None:
    if not zipfile.is_zipfile(ruta):
        return
    with zipfile.ZipFile(ruta) as z:
        total = sum(i.file_size for i in z.infolist())
        comprimido = sum(i.compress_size for i in z.infolist()) or 1
        if total > MAX_DESCOMPRIMIDO or total / comprimido > MAX_PROPORCION or len(z.infolist()) > 20000:
            raise ValueError("El archivo está comprimido de forma sospechosa (se inflaría demasiado al abrirlo).")


def log(*partes):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), *partes, flush=True)


def configuracion() -> dict:
    """Credenciales de la BD y carpeta de storage.

    Como servicio (usuario estudio-worker, sin acceso a config/) llegan por variables de entorno desde
    /etc/estudio/worker.env. A mano se leen de config/config.php (respeta ESTUDIO_ENTORNO=pruebas).
    """
    if os.environ.get("ESTUDIO_DB_HOST"):
        e = os.environ
        return {"db": {"host": e["ESTUDIO_DB_HOST"], "port": e.get("ESTUDIO_DB_PORT", "3306"), "name": e["ESTUDIO_DB_NAME"],
                       "user": e["ESTUDIO_DB_USER"], "pass": e["ESTUDIO_DB_PASS"]},
                "storage": e.get("ESTUDIO_STORAGE", str(RAIZ / "storage"))}
    salida = subprocess.run(
        [PHP, "-r", 'require "config/config.php"; echo json_encode(["db" => $CONFIG["db"], "storage" => $CONFIG["subidas"]["dir"]]);'],
        cwd=RAIZ, capture_output=True, text=True, check=True).stdout
    return json.loads(salida)


CONFIG = configuracion()
STORAGE = Path(CONFIG["storage"])


def conectar():
    c = CONFIG["db"]
    return pymysql.connect(host=c["host"], port=int(c["port"]), user=c["user"], password=c["pass"], database=c["name"],
                           charset="utf8mb4", autocommit=True, cursorclass=pymysql.cursors.DictCursor, connect_timeout=10)


def tomar(con, archivo_id: int | None = None) -> dict | None:
    """Reserva el siguiente pendiente de forma atómica (sirve con varios workers)."""
    with con.cursor() as cur:
        if archivo_id:
            cur.execute("UPDATE archivos SET estado = 'procesando', error = NULL WHERE id = %s", (archivo_id,))
            cur.execute("SELECT * FROM archivos WHERE id = %s", (archivo_id,))
            return cur.fetchone()
        cur.execute("SELECT id FROM archivos WHERE estado = 'pendiente' ORDER BY id LIMIT 5")
        for fila in cur.fetchall():
            if cur.execute("UPDATE archivos SET estado = 'procesando' WHERE id = %s AND estado = 'pendiente'", (fila["id"],)):
                cur.execute("SELECT * FROM archivos WHERE id = %s", (fila["id"],))
                return cur.fetchone()
    return None


def procesar(con, fila: dict) -> None:
    ext = fila["extension"]
    original = STORAGE / "originales" / (f"{fila['uuid']}.{ext}" if ext else fila["uuid"])
    salida = STORAGE / "generados" / fila["uuid"]
    shutil.rmtree(salida, ignore_errors=True)
    salida.mkdir(parents=True)
    t = Trabajo(id=fila["id"], uuid=fila["uuid"], titulo=fila["titulo"], extension=ext, tipo=fila["tipo"],
                mime=fila["mime"], original=original, salida=salida)
    inicio = time.time()
    log(f"#{t.id} {t.tipo} «{t.titulo}» …")
    try:
        if not original.is_file():
            raise FileNotFoundError("El archivo original ya no existe en el servidor.")
        if ext in EXT_ZIP:
            revisar_zip(original)
        signal.signal(signal.SIGALRM, _alarma)
        signal.alarm(TIEMPO_MAX.get(t.tipo, TIEMPO_MAX_OTROS))
        try:
            html, resumen = PROCESADORES.get(t.tipo, otro.procesar)(t)
        finally:
            signal.alarm(0)
        (salida / "contenido.html").write_text(sanear(html), encoding="utf-8")
        if fila["seccion"] == "guia":  # api/ia.php toma fragmentos de aquí para armar los exámenes
            (salida / "texto.txt").write_text(texto_plano(html), encoding="utf-8")
        t.datos["segundos_proceso"] = round(time.time() - inicio, 1)
        (salida / "datos.json").write_text(json.dumps(t.datos, ensure_ascii=False), encoding="utf-8")
        permisos(salida)
        with con.cursor() as cur:
            cur.execute("UPDATE archivos SET estado = 'listo', resumen = %s, error = NULL, procesado = NOW() WHERE id = %s",
                        ((resumen or "")[:1000], t.id))
        log(f"#{t.id} listo en {time.time() - inicio:.1f} s")
    except Exception as e:
        traceback.print_exc()
        mensaje = str(e) or e.__class__.__name__
        with con.cursor() as cur:
            cur.execute("UPDATE archivos SET estado = 'error', error = %s, procesado = NOW() WHERE id = %s", (mensaje[:1000], t.id))
        log(f"#{t.id} error: {mensaje}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--una-vez", action="store_true")
    ap.add_argument("--id", type=int)
    args = ap.parse_args()

    con = conectar()
    if args.id:
        fila = tomar(con, args.id)
        if fila:
            procesar(con, fila)
        return
    # Si el worker se cayó a medias, devuelve a la cola lo que quedó «procesando».
    with con.cursor() as cur:
        cur.execute("UPDATE archivos SET estado = 'pendiente' WHERE estado = 'procesando'")
    log("Worker listo; esperando archivos…")
    while True:
        try:
            try:
                con.ping()
            except pymysql.MySQLError:
                con = conectar()
            fila = tomar(con)
        except (pymysql.MySQLError, subprocess.CalledProcessError) as e:
            log(f"Sin conexión con la BD ({e}); reintento en 10 s")
            time.sleep(10)
            continue
        if fila:
            procesar(con, fila)
        elif args.una_vez:
            return
        else:
            time.sleep(3)


if __name__ == "__main__":
    main()
