#!/bin/sh
# Envoltorio de arranque de los nodos Patroni (Spilo). Se ejecuta como root dentro del contenedor.
# Lee los Docker Secrets y los pasa a Spilo como variables SOLO del proceso (no aparecen en "docker inspect").
# Todo lo que Patroni necesita para crear usuarios y claves en el primer arranque sale de aqui:
#   db_password          -> superusuario "postgres" (el que usa el backend)
#   replicator_password  -> usuario de replicacion "replicator" (lo crea Patroni solo)
#   monitor_password     -> usuario "monitorizacion" (lo crea patroni-post-init.sh)
set -e

leer() { cat "/run/secrets/$1"; }

export PGPASSWORD_SUPERUSER="$(leer db_password)"
export PGUSER_STANDBY="replicator"
export PGPASSWORD_STANDBY="$(leer replicator_password)"

# Red interna de Docker: la base no se publica al host. Sin esto Spilo rechaza conexiones sin SSL.
export ALLOW_NOSSL=true

# Configuracion dinamica inicial del cluster (se guarda en etcd la primera vez):
#  - modo sincronico NO estricto: una escritura se confirma cuando la replica la tiene (RPO cero);
#    si cae la replica, el servicio sigue en modo asincronico en vez de bloquear las escrituras.
#  - wal_keep_size: WAL que el nodo conserva para las replicas. Con el valor por defecto (128 MB), si un nodo cae y
#    el otro pasa a lider, el nodo caido no encuentra el WAL que necesita para volver (pg_rewind) y se queda en
#    "starting" hasta que se lo reconstruye con "patronictl reinit". Con bases grandes (checkpoints largos) pasa
#    seguro; 2GB deja margen amplio. Ver ha/README.md ("Retencion de WAL").
#  - post_init: crea el usuario de monitoreo ademas de los usuarios propios de Spilo.
# Importante: esta seccion solo se aplica al CREAR el cluster (volumen nuevo). En un cluster que ya existe hay que
# cambiarlo con: patronictl edit-config -s postgresql.parameters.wal_keep_size=2GB --force
export SPILO_CONFIGURATION="
bootstrap:
  post_init: bash /hook/patroni-post-init.sh zalandos
  dcs:
    synchronous_mode: true
    postgresql:
      parameters:
        wal_keep_size: 2GB
"

exec /bin/sh /launch.sh init
