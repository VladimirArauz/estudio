"""Audio y video → reproductor web + transcripción con marcas de tiempo (faster-whisper)."""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import numpy

from comun import Trabajo, esc, ejecutar, ffprobe, ficha, reloj, resumen_de

# Modelo de whisper: «base» es rápido en CPU; «small» transcribe mejor pero tarda ~3×.
MODELO = os.environ.get("ESTUDIO_WHISPER", "base")
MAX_TRANSCRIPCION = int(os.environ.get("ESTUDIO_MAX_TRANSCRIPCION_MIN", "90")) * 60
_modelo = None


def _whisper():
    global _modelo
    if _modelo is None:
        from faster_whisper import WhisperModel
        _modelo = WhisperModel(MODELO, device="cpu", compute_type="int8", cpu_threads=max(1, (os.cpu_count() or 2) - 1))
    return _modelo


def transcribir(t: Trabajo, audio: Path, duracion: float) -> list[dict]:
    if duracion > MAX_TRANSCRIPCION:
        t.datos["transcripcion"] = f"omitida (más de {MAX_TRANSCRIPCION // 60} min)"
        return []
    # Se decodifica con ffmpeg a PCM 16 kHz y se pasa como arreglo: así whisper no depende de PyAV.
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(audio), "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
                         capture_output=True, check=True, timeout=1800).stdout
    muestras = numpy.frombuffer(pcm, numpy.int16).astype(numpy.float32) / 32768.0
    segmentos, info = _whisper().transcribe(muestras, vad_filter=True, beam_size=1)
    salida = [{"inicio": round(s.start, 2), "fin": round(s.end, 2), "texto": s.text.strip()} for s in segmentos if s.text.strip()]
    t.datos["idioma"] = info.language
    # Subtítulos WebVTT para el reproductor.
    vtt = ["WEBVTT", ""]
    for s in salida:
        a = f"{int(s['inicio'] // 3600):02d}:{int(s['inicio'] % 3600 // 60):02d}:{s['inicio'] % 60:06.3f}"
        b = f"{int(s['fin'] // 3600):02d}:{int(s['fin'] % 3600 // 60):02d}:{s['fin'] % 60:06.3f}"
        vtt += [f"{a} --> {b}", s["texto"], ""]
    t.ruta("subtitulos.vtt").write_text("\n".join(vtt), encoding="utf-8")
    t.ruta("transcripcion.json").write_text(json.dumps(salida, ensure_ascii=False), encoding="utf-8")
    return salida


def _bloque_transcripcion(segmentos: list[dict], t: Trabajo) -> str:
    if not segmentos:
        motivo = t.datos.get("transcripcion", "no se detectó voz")
        return f'<div class="nota"><p class="rotulo">Transcripción</p><p>Sin transcripción: {esc(motivo)}.</p></div>'
    # Agrupa en párrafos de ~30 s para que se lea como texto corrido.
    parrafos, actual, inicio = [], [], segmentos[0]["inicio"]
    for s in segmentos:
        if actual and s["inicio"] - inicio > 30:
            parrafos.append((inicio, actual))
            actual, inicio = [], s["inicio"]
        actual.append(s)
    parrafos.append((inicio, actual))
    filas = "".join(
        f'<li><button type="button" class="vista-marca" data-seek="{ini}">{reloj(ini)}</button><p>'
        + " ".join(f'<span data-seek="{s["inicio"]}">{esc(s["texto"])}</span>' for s in grupo) + "</p></li>"
        for ini, grupo in parrafos)
    return f'''<section class="vista-transcripcion" aria-label="Transcripción">
      <div class="fila fila--entre"><p class="rotulo">Transcripción automática · toca un tiempo para ir a ese momento</p>
        <span class="chip">{len(segmentos)} fragmentos</span></div>
      <ol class="vista-transcripcion__lista">{filas}</ol></section>'''


def _duracion(info: dict) -> float:
    try:
        return float(info.get("format", {}).get("duration") or 0)
    except ValueError:
        return 0.0


def procesar_audio(t: Trabajo) -> tuple[str, str]:
    info = ffprobe(t.original)
    duracion = _duracion(info)
    # AAC en .m4a se reproduce en todos los navegadores.
    ejecutar(["ffmpeg", "-y", "-v", "error", "-i", str(t.original), "-vn", "-c:a", "aac", "-b:a", "128k", str(t.ruta("audio.m4a"))])
    # Forma de onda como imagen (colores del sistema: amarillo sobre transparente).
    ejecutar(["ffmpeg", "-y", "-v", "error", "-i", str(t.original), "-filter_complex",
              "aformat=channel_layouts=mono,showwavespic=s=1200x160:colors=#F6C200", "-frames:v", "1", str(t.ruta("onda.png"))])
    segmentos = transcribir(t, t.original, duracion)
    t.datos.update(duracion=duracion)
    pista = f'<track kind="captions" src="{t.recurso("subtitulos.vtt")}" srclang="es" label="Español" default>' if segmentos else ""
    tags = info.get("format", {}).get("tags", {}) or {}
    html = f'''<div class="pila vista-medio">
      <figure class="vista-onda"><img src="{t.recurso("onda.png")}" alt="Forma de onda del audio"></figure>
      <audio class="medio" controls preload="metadata" src="{t.recurso("audio.m4a")}">{pista}</audio>
      {ficha([("Duración", reloj(duracion)), ("Título", tags.get("title")), ("Artista", tags.get("artist")), ("Idioma", t.datos.get("idioma"))])}
      {_bloque_transcripcion(segmentos, t)}
    </div>'''
    texto = " ".join(s["texto"] for s in segmentos)
    return html, resumen_de(texto) if texto else f"Audio de {reloj(duracion)}."


def procesar_video(t: Trabajo) -> tuple[str, str]:
    info = ffprobe(t.original)
    duracion = _duracion(info)
    video = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), {})
    tiene_audio = any(s.get("codec_type") == "audio" for s in info.get("streams", []))
    ancho, alto = video.get("width", 0), video.get("height", 0)

    # MP4 H.264 hasta 720p: se reproduce en cualquier navegador y permite adelantar.
    if video.get("codec_name") == "h264" and t.extension in ("mp4", "m4v") and alto <= 1080:
        ejecutar(["ffmpeg", "-y", "-v", "error", "-i", str(t.original), "-c", "copy", "-movflags", "+faststart", str(t.ruta("video.mp4"))])
    else:
        ejecutar(["ffmpeg", "-y", "-v", "error", "-i", str(t.original), "-vf", "scale='min(1280,iw)':-2", "-c:v", "libx264",
                  "-preset", "veryfast", "-crf", "26", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(t.ruta("video.mp4"))], tiempo=7200)

    # Póster y capítulos: 8 miniaturas repartidas en el video.
    ejecutar(["ffmpeg", "-y", "-v", "error", "-ss", str(min(3, duracion / 10)), "-i", str(t.original), "-frames:v", "1",
              "-vf", "scale=1280:-2", str(t.ruta("poster.jpg"))])
    capitulos = []
    if duracion >= 30:
        for i in range(8):
            seg = duracion * (i + 0.5) / 8
            nombre = f"miniaturas/m{i + 1}.jpg"
            ejecutar(["ffmpeg", "-y", "-v", "error", "-ss", f"{seg:.2f}", "-i", str(t.original), "-frames:v", "1",
                      "-vf", "scale=320:-2", str(t.ruta(nombre))])
            capitulos.append((seg, nombre))

    segmentos = transcribir(t, t.original, duracion) if tiene_audio else []
    t.datos.update(duracion=duracion, ancho=ancho, alto=alto)
    pista = f'<track kind="captions" src="{t.recurso("subtitulos.vtt")}" srclang="es" label="Español">' if segmentos else ""
    rejilla = ""
    if capitulos:
        rejilla = '<section class="pila" aria-label="Momentos del video"><p class="rotulo">Momentos · toca uno para ir ahí</p><div class="vista-momentos">' + "".join(
            f'<button type="button" class="vista-momento" data-seek="{seg:.2f}"><img src="{t.recurso(n)}" alt="Momento {reloj(seg)}" loading="lazy"><span class="rotulo">{reloj(seg)}</span></button>'
            for seg, n in capitulos) + "</div></section>"
    html = f'''<div class="pila vista-medio">
      <video class="medio" controls preload="metadata" playsinline poster="{t.recurso("poster.jpg")}" src="{t.recurso("video.mp4")}">{pista}</video>
      {ficha([("Duración", reloj(duracion)), ("Resolución", f"{ancho} × {alto}" if ancho else None), ("Idioma", t.datos.get("idioma"))])}
      {rejilla}
      {_bloque_transcripcion(segmentos, t)}
    </div>'''
    texto = " ".join(s["texto"] for s in segmentos)
    return html, resumen_de(texto) if texto else f"Video de {reloj(duracion)}."
