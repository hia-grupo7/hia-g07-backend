# Alta disponibilidad de la base de datos (CARD-08) — Patroni + etcd + HAProxy

Este diseño reemplaza el PostgreSQL de un solo nodo (más una réplica manual) por un clúster con **failover automático**.

## Qué hay

| Pieza | Contenedores | Función |
|---|---|---|
| PostgreSQL 16 + Patroni | `rayuela-patroni1`, `rayuela-patroni2` | Dos nodos idénticos: uno es **líder** (lee y escribe) y el otro **réplica asincrónica** |
| etcd | `rayuela-etcd1/2/3` | Árbitro: guarda quién es el líder. Tolera la caída de uno |
| HAProxy | `rayuela-haproxy` | Único punto de entrada: `:5000` escritura (siempre el líder), `:5001` lectura (líder o réplica). Panel en `http://127.0.0.1:7000` |
| PgBouncer | `rayuela-pgbouncer` | Agrupa las conexiones de **escritura** del backend (`:6432`, modo transacción, hasta 150 clientes y 25 conexiones reales) y las reenvía a HAProxy `:5000`. Las lecturas no pasan por aquí |
| Exportadores | `rayuela-postgres-exporter1/2` | Métricas de cada nodo para Prometheus (usuario `monitorizacion`) |

La base **no se publica al equipo**. Camino de la aplicación:

- **Escrituras:** backend → PgBouncer `:6432` → HAProxy `:5000` → líder.
- **Lecturas:** backend → HAProxy `:5001` → líder o réplica (reparto *round-robin*).

El backup y pgAdmin entran directo por HAProxy. Como PgBouncer apunta a HAProxy `:5000` (no a un nodo fijo), sigue al líder
si hay failover: se probó a mano el 2026-11-20 y PgBouncer siguió al nuevo líder sin intervención.
La aplicación usa su propia base, **`rayuela`**, creada vacía en el primer arranque (la base `postgres` queda para Patroni).

## Qué se automatizó

Al levantar el compose por primera vez, **sin pasos manuales**:

- Los usuarios y claves se crean solos desde los Docker Secrets (`ha/patroni-entrypoint.sh` y `ha/patroni-post-init.sh`):

  | Usuario | Para qué | Clave (secreto) |
  |---|---|---|
  | `postgres` | Superusuario; lo usa el backend | `secrets/db_password` |
  | `replicator` | Replicación entre nodos | `secrets/replicator_password` |
  | `monitorizacion` | Exportadores de métricas (rol `pg_monitor`) | `secrets/monitor_password` |

- La réplica se clona sola desde el líder.
- La replicación es **asincrónica** (`synchronous_mode: false`): el líder confirma sin esperar a la réplica. Si el líder
  cae, pueden perderse las últimas escrituras que la réplica aún no recibió (Patroni no promueve una réplica con más de
  32 MB de atraso). Para volver al modo síncrono: `patronictl edit-config -s synchronous_mode=true --force`.
- Las pruebas de failover de abajo se midieron en modo sincrónico (0 pérdidas); repetirlas en asincrónico antes de citarlas.
- La base `rayuela` se crea desde `template0`, de modo que su volcado (`pg_dump`) se restaura limpio.

Para agregar otro usuario automáticamente, añadir su `CREATE ROLE` en `ha/patroni-post-init.sh` leyendo la clave de un
secreto nuevo (declararlo en `compose.yaml`, en los `secrets` de los dos nodos y en `scripts/init-secrets.js`).
**Esto solo corre cuando el clúster se inicializa por primera vez** (volumen nuevo). Con un clúster ya creado, un
usuario nuevo se crea a mano en el líder (`CREATE ROLE ...`) y se replica solo.

## Puesta en marcha

```bash
node scripts/init-secrets.js --valores-actuales     # crea los secretos que falten (monitor_password, ...)
docker build -t rayuela-backend:ha-1 .               # imagen del backend con reintentos ante failover
# .env: DB_NAME=rayuela (y BACKEND_BLUE_IMAGE=rayuela-backend:ha-1 si usás esa imagen local)
docker compose --profile blue up -d etcd1 etcd2 etcd3 patroni1 patroni2 haproxy
# esperar a que haproxy este "healthy" (1 a 2 minutos la primera vez), luego:
docker compose --profile blue up -d backup pgbouncer pgadmin backend-blue frontend nginx-proxy postgres_exporter1 postgres_exporter2
docker exec rayuela-nginx-proxy nginx -s reload      # nginx no re-resuelve la IP del backend recreado
```

> **No usar `docker compose up -d` sin nombres de servicio**: levanta también `cloudflared` y publica la aplicación
> en Internet. Levantar los servicios por nombre.

Cargar el catálogo de ejemplo: `node seed.js` (con `DB_HOST=haproxy`, `DB_PORT=5000`, `DB_NAME=rayuela`) o desde un
contenedor temporal con la imagen del backend.

## Estado del clúster

```bash
docker exec rayuela-patroni1 patronictl list      # un Leader y un Sync Standby / streaming, Lag 0
docker exec rayuela-patroni1 patronictl history   # historial de cambios de líder
curl -s http://127.0.0.1:7000/                    # panel de HAProxy (en el navegador)
```

## Probar el failover (a mano)

1. Ver quién es el líder: `docker exec rayuela-patroni1 patronictl list` (o el panel de HAProxy en `http://127.0.0.1:7000`,
   donde el servidor verde del backend `primary` es el líder).
2. Parar el líder: `docker stop rayuela-patroniN` (apagado ordenado) o `docker kill rayuela-patroniN` (caída abrupta).
3. Esperar a que el otro nodo pase a **Leader** y HAProxy lo marque `UP` en `primary` (con `docker stop` ~4 s; con
   `docker kill` unos 25 a 30 s, hasta que vence el `ttl` de Patroni). Mientras tanto la aplicación sigue respondiendo
   las lecturas (las atiende la réplica) y las escrituras esperan.
4. Volver a levantarlo: `docker start rayuela-patroniN`. Vuelve como réplica y en unos 5 s queda en `streaming`
   con lag 0 (`patronictl list`). El historial de cambios de líder: `docker exec rayuela-patroni1 patronictl history`.

Resultados medidos en esta máquina con una carga continua por la API (un login por medio segundo y una lectura del
catálogo) y comprobando al final que no faltara ninguna escritura confirmada:

| Medida | Caída abrupta (`docker kill`, 3 corridas) | Apagado ordenado (`docker stop`, 1 corrida) |
|---|---|---|
| Nuevo líder elegido | 25 a 26 s después de la caída (`ttl` de 30 s de Patroni) | 4 s |
| Escrituras durante la caída | El login en vuelo esperó 37-38 s y terminó correcto en 2 corridas; en 1 corrida ese pedido devolvió error | El pedido más lento esperó 6 s; 0 errores |
| Lecturas durante la caída | 99 de 99, 99 de 99 y 98 de 98 correctas (las atiende la réplica) | 62 de 62 correctas |
| Escrituras confirmadas perdidas | 0 | 0 |
| Nodo caído al volver | Réplica sincrónica en `streaming` a los 4-5 s de arrancar | 5 s |

Con una caída abrupta **no se garantiza** que el pedido que estaba en vuelo justo en ese instante termine bien: puede
recibir un error. Los pedidos nuevos esperan y se completan.

Cambio ordenado de líder (mantenimiento, ~3 s, sin pérdida):
`docker exec rayuela-patroni1 patronictl switchover rayuela-cluster --leader patroni1 --candidate patroni2 --scheduled now --force`

## Retención de WAL y apagado de los nodos

Con la base cargada (millones de filas) el nodo caído **no podía volver**: tras un `docker stop` del líder, el otro nodo
pasaba a líder y el que volvía se quedaba en `starting` con el error
`requested WAL segment ... has already been removed`. Para reincorporarse, un ex líder necesita el WAL desde su último
checkpoint (`pg_rewind`), y con una carga grande ese checkpoint dura minutos y queda unos 200 MB atrás. El nodo que ahora es
líder solo conservaba 128 MB (valor por defecto) y ya había reciclado el resto. Con bases chicas esa brecha nunca se supera,
por eso no se notaba. La única salida era reconstruir el nodo (`patronictl reinit`).

Se corrigió con dos ajustes:

| Ajuste | Dónde | Efecto |
|---|---|---|
| `wal_keep_size = 2GB` | Configuración dinámica de Patroni (etcd). Para clústers nuevos, en `ha/patroni-entrypoint.sh` | El nodo que es líder guarda hasta 2 GB de WAL para el que está caído |
| `stop_grace_period: 60s` | `compose.yaml`, en `patroni1` y `patroni2` | Docker da 60 s (no los 10 s por defecto) para que Postgres termine el checkpoint de apagado; con 10 s lo mataba a medio apagar |

**El valor en `ha/patroni-entrypoint.sh` solo se aplica al crear el clúster** (volumen nuevo). En un clúster que ya
existe se cambia así (no hace falta reiniciar) y se comprueba:

```bash
docker exec rayuela-patroni1 patronictl edit-config rayuela-cluster -s postgresql.parameters.wal_keep_size=2GB --force
docker exec rayuela-patroni1 psql -U postgres -At -c "SHOW wal_keep_size;"      # 2GB
```

El WAL conservado ocupa disco en el nodo líder (hasta 2 GB por encima del tamaño normal).

Prueba repetida con el ajuste, con la carga reciente que antes lo rompía (tabla temporal de 8 millones de filas más un
`UPDATE`, unos 3 GB de WAL, y `docker stop` del líder inmediatamente después):

| Medida | Resultado |
|---|---|
| `docker stop` del líder | 19 s, apagado ordenado (código 143) |
| Nuevo líder | 20 s después de iniciar el `stop` |
| Filas en el nuevo líder | 8.000.000 de 8.000.000 (0 perdidas) |
| Nodo caído al volver | `streaming` a los 9 s de arrancar y réplica sincrónica en unos 30 s, sin el error de WAL |

También se comprobó con una escritura mientras un nodo estaba caído: la fila agregada en el líder apareció en el nodo
cuando volvió.

Si aun así un nodo queda en `starting` y el log de Postgres repite `has already been removed`, se reconstruye desde el líder:
por ejemplo, si el atascado es `patroni1` y el líder es `patroni2`:
`docker exec rayuela-patroni2 patronictl reinit rayuela-cluster patroni1 --force`. Se ejecuta desde el nodo que está
corriendo bien y borra solo la copia del nodo atascado.

## Volver atrás (al PostgreSQL de un solo nodo)

El volumen del diseño anterior (`rayuela_postgres_data`) no se borra. Para volver hay que usar la versión anterior del
`compose.yaml` (commit previo a este diseño) y levantar los servicios por nombre.
Los datos escritos en el clúster nuevo no pasan al volumen viejo: hacer antes un backup
(`docker exec rayuela-backup sh /usr/local/bin/backup.sh`) y restaurarlo con `restore.sh`.

## Límites y pendientes conocidos

- **No es continuidad total:** durante unos 25-30 s (hasta que Patroni elige líder) las escrituras esperan. El backend
  espera y reintenta hasta ~49 s para que el usuario vea una respuesta lenta pero correcta.
- **Dos nodos:** tras una caída queda un solo nodo hasta que el otro vuelve; no hay una segunda caída que tolerar.
  Un tercer nodo daría margen, a costa de más recursos.
- **Sin TLS** dentro de la red de Docker (`ALLOW_NOSSL=true`): la base no se publica, pero el tráfico interno no va cifrado.
- **etcd sin autenticación** (red interna). Los nodos Patroni no tienen `read_only`/`no-new-privileges` (Spilo los necesita).
- `scripts/rotate-secrets.js` todavía apunta al PostgreSQL de un solo nodo (busca `rayuela-db-primary`): **no sirve** para rotar
  `db_password` ni `replicator_password` con este clúster. Pendiente de adaptar; mientras tanto no usarlo para esos dos secretos.
- `scripts/verify-cluster-replication.ps1` y `verify-db-persistence.ps1` nombran los contenedores anteriores.
- **Réplica asincrónica:** una lectura por el `:5001` puede caer en la réplica y no ver todavía lo que se acaba de escribir
  (retraso de replicación, normalmente muy pequeño). El backend no fuerza lecturas al líder (no hay `useMaster`), así que un
  flujo de "crear y volver a leer enseguida" puede mostrar el dato viejo (ver la incidencia del `reload()` en
  `docs/mantis/incidencias.json`).
- **PgBouncer es ahora un punto único para las escrituras:** si cae, el backend no puede escribir (las lecturas siguen por
  HAProxy). Tiene `restart: unless-stopped`, así que Docker lo levanta de nuevo.
- **PgBouncer sigue publicando el puerto 6432 en todas las interfaces** (pendiente de cerrar a `127.0.0.1`).
- El backup guarda los volcados en el mismo equipo y volumen que los datos (sin copia externa).
- Si el `.env` de otra persona fija `DB_NAME=postgres`, el clúster usará esa base y la restauración de backups chocará con los objetos propios de Spilo: usar `DB_NAME=rayuela`.
