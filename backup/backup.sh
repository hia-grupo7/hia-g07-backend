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

# Con un pipe simple (pg_dump | gzip) el estado de salida es el de gzip: si pg_dump falla, igual se declaraba "Backup OK"
# con un archivo vacio. Se guarda el estado de pg_dump aparte y se verifica.
ESTADO="/tmp/pg_dump.estado"
rm -f "${ESTADO}"
{ PGPASSWORD="${DB_PASSWORD}" pg_dump -h "${DB_HOST:-haproxy}" -p "${DB_PORT:-5000}" -U "${DB_USER}" -d "${DB_NAME}"; echo $? > "${ESTADO}"; } | gzip > "${ARCHIVO}"
CODIGO_DUMP="$(cat "${ESTADO}" 2>/dev/null)"
if [ "${CODIGO_DUMP}" != "0" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: pg_dump fallo (codigo ${CODIGO_DUMP:-desconocido}); no se genero un backup valido."
  rm -f "${ARCHIVO}"
  exit 1
fi

FIN=$(date +%s)
TIEMPO=$((FIN - INICIO))
TAMANO=$(du -h "${ARCHIVO}" | cut -f1)

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup OK: ${ARCHIVO} | Tiempo: ${TIEMPO}s | Tamaño: ${TAMANO}"

# Política de retención: borrar backups más viejos que RETENCION_DIAS
find /backups -name "rayuela_*.sql.gz" -mtime +${RETENCION_DIAS} -delete
echo "Retención aplicada: se conservan los últimos ${RETENCION_DIAS} días."