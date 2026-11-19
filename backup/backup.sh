#!/bin/sh
set -e

# Cargar las variables del contenedor (cron no las hereda)
. /etc/backup.env

# Contraseña: Docker Secret si existe (CARD-20); si no, la variable DB_PASSWORD (compatibilidad).
if [ -r /run/secrets/db_password ]; then
  DB_PASSWORD="$(cat /run/secrets/db_password)"
fi

FECHA=$(date +%Y-%m-%d_%H%M)
ARCHIVO="/backups/rayuela_${FECHA}.sql.gz"
RETENCION_DIAS=7

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Iniciando backup de ${DB_NAME}..."
INICIO=$(date +%s)

PGPASSWORD="${DB_PASSWORD}" pg_dump -h postgres-primary -U "${DB_USER}" -d "${DB_NAME}" | gzip > "${ARCHIVO}"

FIN=$(date +%s)
TIEMPO=$((FIN - INICIO))
TAMANO=$(du -h "${ARCHIVO}" | cut -f1)

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup OK: ${ARCHIVO} | Tiempo: ${TIEMPO}s | Tamaño: ${TAMANO}"

# Política de retención: borrar backups más viejos que RETENCION_DIAS
find /backups -name "rayuela_*.sql.gz" -mtime +${RETENCION_DIAS} -delete
echo "Retención aplicada: se conservan los últimos ${RETENCION_DIAS} días."