#!/usr/bin/env bash
# Abre el túnel SSH hacia la BD de IONOS: 127.0.0.1:3307 → BD:3306.
# La BD de IONOS solo es visible desde su hosting; por eso se pasa por el SSH del webspace.
# Uso: bin/tunel.sh            (se queda en primer plano y se reconecta solo)
set -euo pipefail
cd "$(dirname "$0")/.."

CONF=config/tunel.local.json
leer() { python3 -I -c "import json,sys;print(json.load(open(sys.argv[1]))[sys.argv[2]])" "$CONF" "$1"; }

HOST=$(leer host)
USUARIO=$(leer user)
DB_HOST=$(leer db_host)
export SSHPASS=$(leer pass)

if ss -ltn 'sport = :3307' | grep -q 3307; then
  echo "El puerto 3307 ya está en uso; el túnel parece estar abierto."
  exit 0
fi

echo "Túnel 127.0.0.1:3307 → $DB_HOST:3306 vía $USUARIO@$HOST"
# sshpass solo responde una vez por conexión, así que la reconexión se hace con un bucle.
while true; do
  sshpass -e ssh -N \
    -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
    -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=accept-new \
    -L 127.0.0.1:3307:"$DB_HOST":3306 "$USUARIO@$HOST" || true
  echo "Túnel caído; reconectando en 5 s…" >&2
  sleep 5
done
