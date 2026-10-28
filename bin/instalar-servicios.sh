#!/usr/bin/env bash
# Instala y arranca el túnel y el worker como servicios del sistema (se inician solos al prender la PC).
# El worker corre aislado con el usuario estudio-worker (ver bin/systemd/estudio-worker.service).
# Uso: sudo bin/instalar-servicios.sh
set -euo pipefail
cd "$(dirname "$0")/.."
RAIZ=$PWD

# Usuario propio del worker, sin shell ni home.
id estudio-worker >/dev/null 2>&1 || useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --user-group estudio-worker

# generados/: lo escribe el worker y Apache (grupo daemon) lo lee y lo borra. originales/: lo escribe Apache.
chown -R estudio-worker:daemon storage/generados
find storage/generados -type d -exec chmod 2775 {} +
chgrp -R daemon storage/originales && chmod 2775 storage/originales

# Credenciales solo de la BD para el worker (sin key de Gemini ni app_key). Solo root lo lee; systemd lo inyecta.
install -d -m 750 -o root -g root /etc/estudio
/opt/lampp/bin/php -r 'require "config/config.php"; $d = $CONFIG["db"];
  foreach (["HOST" => "host", "PORT" => "port", "NAME" => "name", "USER" => "user", "PASS" => "pass"] as $k => $c) {
    if (preg_match("/[\n\"\\\\]/", (string)$d[$c])) { fwrite(STDERR, "La credencial $c tiene caracteres no soportados.\n"); exit(1); }
    echo "ESTUDIO_DB_$k=\"", $d[$c], "\"\n";
  }
  echo "ESTUDIO_STORAGE=\"", $CONFIG["subidas"]["dir"], "\"\n";' > /etc/estudio/worker.env
chmod 600 /etc/estudio/worker.env

cp bin/systemd/estudio-tunel.service bin/systemd/estudio-worker.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now estudio-tunel.service estudio-worker.service
systemctl restart estudio-worker.service
systemctl --no-pager status estudio-tunel.service estudio-worker.service | grep -E '●|Active'
systemd-analyze security estudio-worker.service | tail -1
