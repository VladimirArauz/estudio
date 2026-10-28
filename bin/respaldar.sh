#!/usr/bin/env bash
# Respaldo cifrado de la BD de IONOS (por el túnel) y de storage/. Lo corre a diario estudio-respaldo.timer.
# Cifra con la llave pública /etc/estudio/respaldos.pub (age): el servidor no puede descifrarlos; la llave
# privada vive aparte (ver docs/operacion.md). Conserva los últimos 14 días.
# Uso: sudo bin/respaldar.sh
set -euo pipefail
cd "$(dirname "$0")/.."
RAIZ=$PWD
DUENO=$(stat -c %U "$RAIZ")
DESTINO=${ESTUDIO_RESPALDOS:-/home/$DUENO/respaldos/automaticos}
LLAVE=/etc/estudio/respaldos.pub
FECHA=$(date +%Y%m%d-%H%M)
umask 077
install -d -m 700 -o "$DUENO" -g "$DUENO" "$DESTINO"

# Credenciales de la BD: las mismas que recibe el worker (solo root las lee).
set -a; . /etc/estudio/worker.env; set +a
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

MYSQL_PWD="$ESTUDIO_DB_PASS" /opt/lampp/bin/mysqldump -h "$ESTUDIO_DB_HOST" -P "$ESTUDIO_DB_PORT" -u "$ESTUDIO_DB_USER" \
  --single-transaction --routines --triggers --no-tablespaces "$ESTUDIO_DB_NAME" | gzip -9 > "$tmp/bd.sql.gz"
gzip -t "$tmp/bd.sql.gz"
zcat "$tmp/bd.sql.gz" | tail -1 | grep -q "Dump completed" || { echo "El volcado de la BD quedó incompleto." >&2; exit 1; }
tar -czf "$tmp/storage.tar.gz" -C "$RAIZ" storage

age -R "$LLAVE" -o "$DESTINO/estudio-bd-$FECHA.sql.gz.age" "$tmp/bd.sql.gz"
age -R "$LLAVE" -o "$DESTINO/estudio-storage-$FECHA.tar.gz.age" "$tmp/storage.tar.gz"
chown "$DUENO:$DUENO" "$DESTINO"/estudio-*-"$FECHA".*.age

find "$DESTINO" -name 'estudio-*.age' -mtime +14 -delete
echo "Respaldo listo: $(du -ch "$DESTINO"/estudio-*-"$FECHA".*.age | tail -1 | cut -f1) en $DESTINO"
