#!/usr/bin/env bash
# Corre el worker una vez (o un comando) contra el ENTORNO DE PRUEBAS con el mismo aislamiento que el
# servicio estudio-worker (se copian sus opciones de bin/systemd/estudio-worker.service).
# Uso: sudo bin/worker-pruebas.sh                 → procesa la cola de pruebas y termina
#      sudo bin/worker-pruebas.sh -- <comando…>   → corre otro comando dentro del mismo sandbox
set -euo pipefail
cd "$(dirname "$0")/.."
RAIZ=$PWD
UNIDAD=bin/systemd/estudio-worker.service

props=()
while IFS= read -r linea; do
  case "$linea" in
    ''|'#'*|'['*) continue ;;
    ExecStart=*|EnvironmentFile=*|Restart=*|RestartSec=*|WorkingDirectory=*|Bind*Paths=*|Description=*|After=*|Wants=*|WantedBy=*) continue ;;
  esac
  props+=(-p "$linea")
done < "$UNIDAD"

# Credenciales de la BD de pruebas (las lee PHP como root; no se imprimen).
mapfile -t env < <(ESTUDIO_ENTORNO=pruebas /opt/lampp/bin/php -r 'require "config/config.php";
  $d = $CONFIG["db"]; if ($d["name"] !== "estudio_pruebas") exit(2);
  foreach (["HOST" => "host", "PORT" => "port", "NAME" => "name", "USER" => "user", "PASS" => "pass"] as $k => $c) echo "ESTUDIO_DB_$k=", $d[$c], "\n";
  echo "ESTUDIO_STORAGE=", $CONFIG["subidas"]["dir"], "\n";')
envs=()
for e in "${env[@]}"; do envs+=(-E "$e"); done

if [[ "${1:-}" == "--" ]]; then shift; cmd=("$@"); else cmd=("$RAIZ/procesador/.venv/bin/python" -I procesador/worker.py --una-vez); fi

exec systemd-run --quiet --wait --pipe --collect --unit="estudio-worker-pruebas-$$" \
  "${props[@]}" "${envs[@]}" \
  -p WorkingDirectory="$RAIZ" \
  -p BindReadOnlyPaths="$RAIZ/procesador" \
  -p BindReadOnlyPaths="$RAIZ/storage-pruebas/originales" \
  -p BindPaths="$RAIZ/storage-pruebas/generados" \
  "${cmd[@]}"
