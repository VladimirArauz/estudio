#!/usr/bin/env bash
# Prueba de restauración: descifra un respaldo de la BD y lo carga en la BD LOCAL de pruebas (estudio_pruebas).
# Nunca toca IONOS. Uso: sudo bin/restaurar-prueba.sh ~/respaldos/automaticos/estudio-bd-AAAAMMDD-HHMM.sql.gz.age
set -euo pipefail
cd "$(dirname "$0")/.."
ARCHIVO=${1:?Indica el archivo .sql.gz.age}
DUENO=$(stat -c %U "$PWD")
PRIVADA=${ESTUDIO_LLAVE_RESPALDOS:-/home/$DUENO/.config/estudio-respaldos/llave-privada.txt}
mapfile -t c < <(ESTUDIO_ENTORNO=pruebas /opt/lampp/bin/php -r 'require "config/config.php"; $d = $CONFIG["db"];
  if ($d["name"] !== "estudio_pruebas" || (int)$d["port"] === 3307) exit(2); echo $d["host"], "\n", $d["port"], "\n", $d["user"], "\n", $d["pass"], "\n";')
age -d -i "$PRIVADA" "$ARCHIVO" | gunzip | MYSQL_PWD="${c[3]}" /opt/lampp/bin/mysql -h "${c[0]}" -P "${c[1]}" -u "${c[2]}" estudio_pruebas
MYSQL_PWD="${c[3]}" /opt/lampp/bin/mysql -h "${c[0]}" -P "${c[1]}" -u "${c[2]}" -N estudio_pruebas \
  -e "SELECT CONCAT('usuarios=', (SELECT COUNT(*) FROM usuarios), ' materias=', (SELECT COUNT(*) FROM materias), ' archivos=', (SELECT COUNT(*) FROM archivos))"
echo "Restauración de prueba correcta (BD estudio_pruebas). Corre «tests/herramientas/preparar.php reiniciar» antes de las pruebas."
