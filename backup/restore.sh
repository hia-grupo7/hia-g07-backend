#!/bin/sh
set -e

# Uso: restore.sh <archivo.sql.gz> [base_destino]
# Ejemplo: restore.sh /backups/rayuela_2026-11-13_0300.sql.gz rayuela_restore

if [ -z "$1" ]; then
  echo "Uso: restore.sh <archivo.sql.gz> [base_destino]"
  exit 1
fi

. /etc/backup.env

ARCHIVO="$1"
DESTINO="${2:-${DB_NAME}_restore}"

if [ ! -f "${ARCHIVO}" ]; then
  echo "Error: no existe el archivo ${ARCHIVO}"
  exit 1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restaurando ${ARCHIVO} en la base ${DESTINO}..."
INICIO=$(date +%s)

export PGPASSWORD="${DB_PASSWORD}"

# Crear la base destino si no existe
psql -h postgres-primary -U "${DB_USER}" -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='${DESTINO}'" | grep -q 1 \
  || psql -h postgres-primary -U "${DB_USER}" -d postgres -c "CREATE DATABASE ${DESTINO}"

gunzip -c "${ARCHIVO}" | psql -h postgres-primary -U "${DB_USER}" -d "${DESTINO}" -v ON_ERROR_STOP=1 -q

FIN=$(date +%s)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restauración OK en ${DESTINO} | Tiempo: $((FIN - INICIO))s"