#!/usr/bin/env bash
# Instala y arranca el túnel y el worker como servicios del sistema (se inician solos al prender la PC).
# Uso: sudo bin/instalar-servicios.sh
set -euo pipefail
cd "$(dirname "$0")"
cp systemd/estudio-tunel.service systemd/estudio-worker.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now estudio-tunel.service estudio-worker.service
systemctl --no-pager status estudio-tunel.service estudio-worker.service | grep -E '●|Active'
