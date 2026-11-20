#!/bin/bash
# Se ejecuta UNA vez, en el primer arranque del cluster (cuando Patroni inicializa la base), solo en el nodo que
# se convierte en primario. Los usuarios y claves se crean desde los Docker Secrets: no hay valores escritos aqui.
#   $1 = rol humano de Spilo, $2 = URL de conexion (la agrega Patroni)
/scripts/post_init.sh "$@" || exit $?

MONITOR_PASSWORD="$(cat /run/secrets/monitor_password)"
# Base de la aplicacion. Se crea desde template0 (vacia) y no desde template1: asi no hereda los objetos propios de
# Spilo (metric_helpers, extensiones) y su volcado (pg_dump) se puede restaurar limpio en otra base.
psql -d "$2" -X -v ON_ERROR_STOP=1 -v pw="$MONITOR_PASSWORD" -v dbname="${DB_NAME:-rayuela}" <<'SQL'
SELECT format('CREATE DATABASE %I TEMPLATE template0', :'dbname')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'dbname')\gexec

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'monitorizacion') THEN
    CREATE ROLE monitorizacion LOGIN;
  END IF;
END $$;
ALTER ROLE monitorizacion WITH LOGIN PASSWORD :'pw';
GRANT pg_monitor TO monitorizacion;
SQL
