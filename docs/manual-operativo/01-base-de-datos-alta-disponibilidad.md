# Manual operativo de Rayuela — 01. Base de datos de alta disponibilidad (Patroni, etcd, HAProxy)

## Cómo funciona

- Hay dos nodos PostgreSQL 16 con Patroni (`rayuela-patroni1` y `rayuela-patroni2`). Siempre uno es **líder** (acepta
  lecturas y escrituras) y el otro es **réplica sincrónica** (copia cada escritura antes de que se confirme).
- Tres nodos etcd (`rayuela-etcd1/2/3`) guardan quién es el líder. Mientras queden dos etcd vivos, Patroni puede decidir.
- HAProxy (`rayuela-haproxy`) es el único punto de entrada: el puerto 5000 va siempre al líder; el 5001 va a cualquier
  nodo que pueda leer. El backend usa ambos. Si el líder cambia, HAProxy lo detecta en unos 4 segundos.
- **Failover automático:** si el líder cae, la réplica se promueve sola. Medido en pruebas: entre 25 y 30 segundos
  (el tiempo de vida del permiso de líder, `ttl`, es 30 s). Durante esa ventana las escrituras esperan; el backend
  reintenta durante unos 49 segundos, así que el usuario ve una respuesta lenta pero correcta en vez de un error.
- **Modo sincrónico (no estricto):** una escritura confirmada ya está en la réplica, por eso en las pruebas no se
  perdió ninguna escritura confirmada. Si cae la réplica, el servicio sigue y pasa a modo asincrónico para no bloquear.
- **Nodo que vuelve:** cuando se levanta el nodo caído, Patroni lo reconfigura solo como réplica (con `pg_rewind`) y
  lo resincroniza. Medido: vuelve a `streaming` en menos de 10 segundos.
- La aplicación usa su propia base, `rayuela` (creada vacía en el primer arranque); la base `postgres` queda para uso interno de
  Patroni. Para consultar tablas de la aplicación con psql hay que indicar `-d rayuela`.
- Los usuarios se crean solos en el primer arranque desde los Docker Secrets: `postgres` (superusuario, clave
  `db_password`), `replicator` (replicación, clave `replicator_password`) y `monitorizacion` (rol `pg_monitor`, clave
  `monitor_password`).

## Comandos de lectura del clúster

```bash
docker exec rayuela-patroni1 patronictl list                 # quién es líder, estado, línea de tiempo (TL) y retraso
docker exec rayuela-patroni1 patronictl history              # historial de cambios de líder
docker exec rayuela-patroni1 patronictl show-config          # configuración dinámica (ttl, synchronous_mode, etc.)
docker exec rayuela-patroni2 psql -U postgres -c "select application_name, state, sync_state from pg_stat_replication"
docker exec rayuela-etcd1 etcdctl endpoint health --cluster # salud de los tres etcd
curl -s http://127.0.0.1:7000/ | head                       # panel de HAProxy (en el navegador: http://127.0.0.1:7000)
```

Estados normales de `patronictl list`: un nodo `Leader` / `running` y otro `Sync Standby` / `streaming` con
`Lag in MB` en 0.

## DB-01. Se cayó el nodo líder (failover automático)

**Síntomas:** evento `NODO_DB_CAIDO` y luego `LIDER_CAMBIO`. Durante 25-30 segundos las escrituras tardan. `patronictl
list` muestra un solo nodo y es `Leader` con la línea de tiempo (TL) aumentada en uno.

**Causa probable:** el contenedor del líder se detuvo, se mató por falta de memoria o su máquina se reinició.

**Diagnóstico:**
```bash
docker ps -a --filter name=rayuela-patroni --format '{{.Names}}\t{{.Status}}'
docker logs --tail 50 rayuela-patroni1          # reemplazar por el nodo caido
docker inspect -f '{{.State.OOMKilled}} {{.State.ExitCode}}' rayuela-patroni1
```

**Solución:** no hay que promover nada a mano: Patroni ya lo hizo. Solo hay que levantar el nodo caído:
```bash
docker start rayuela-patroni1                   # reemplazar por el nodo caido
docker exec rayuela-patroni2 patronictl list    # esperar Sync Standby / streaming
```
Si el contenedor se detiene de nuevo, revisar `docker logs` y la memoria disponible (`docker stats --no-stream`).

**Verificación:** `patronictl list` con un `Leader` y un `Sync Standby` en `streaming` y `Lag in MB` 0;
`curl http://localhost/api/health` devuelve `conectada`.

**Escalar si:** el nodo no vuelve a `streaming` en 5 minutos (ver DB-07).

## DB-02. Se cayó la réplica o queda un solo nodo (evento SIN_REPLICA)

**Síntomas:** evento `NODO_DB_CAIDO` del nodo réplica o `SIN_REPLICA`. El servicio sigue funcionando porque el líder
sigue vivo, pero **no hay redundancia**: si ahora cae el líder, el servicio se detiene hasta que alguno vuelva.

**Solución:**
```bash
docker start rayuela-patroni2                   # reemplazar por el nodo caido
docker exec rayuela-patroni1 patronictl list
```
El modo sincrónico no estricto evita que las escrituras se bloqueen mientras no hay réplica; el sistema pasa a
asincrónico hasta que la réplica vuelve.

**Importante:** una réplica caída por mucho tiempo hace que el líder conserve archivos de registro (WAL) para ella y
el disco puede llenarse. Si va a estar caída más de unas horas, ver DB-09.

## DB-03. Cambió el líder (evento LIDER_CAMBIO)

**Síntomas:** el monitor informa que el líder pasó de un nodo a otro.

**Causas:** failover por caída (DB-01), cambio ordenado hecho a mano, o reinicio de un nodo.

**Diagnóstico:** `docker exec rayuela-patroni1 patronictl history` muestra cada cambio con hora y motivo.

**Cambio ordenado de líder a propósito** (mantenimiento; dura unos 3 segundos y no pierde datos):
```bash
docker exec rayuela-patroni1 patronictl switchover rayuela-cluster --leader patroni1 --candidate patroni2 --scheduled now --force
```
Reemplazar `patroni1` por el líder actual y `patroni2` por el nodo que debe pasar a líder.

**Verificación:** `patronictl list` con el líder esperado y la réplica en `streaming`.

## DB-04. El clúster no tiene líder (SIN_LIDER o HAPROXY_SIN_PRIMARIO)

**Síntomas:** las escrituras fallan o se quedan esperando más de un minuto; `patronictl list` no muestra ningún
`Leader`; el panel de HAProxy marca ambos nodos del bloque `primary` en rojo; `/api/health` informa `desconectada`.

**Causas probables:** (a) no hay quórum de etcd (ver DB-05); (b) los dos nodos cayeron; (c) los dos nodos están
levantando y todavía eligen líder (puede tardar hasta 40 segundos); (d) la réplica estaba muy atrasada y Patroni se
negó a promoverla para no perder datos.

**Diagnóstico:**
```bash
docker ps -a --filter name=rayuela-patroni --filter name=rayuela-etcd --format '{{.Names}}\t{{.Status}}'
docker exec rayuela-etcd1 etcdctl endpoint health --cluster
docker logs --tail 80 rayuela-patroni1
docker logs --tail 80 rayuela-patroni2
```
En los logs de Patroni buscar `no action. I am (...), a secondary` (hay un líder), `failed to acquire initialize lock`,
`etcd is not accessible` o `demoted self`.

**Solución:**
1. Si falta etcd, resolver primero DB-05.
2. Si los dos nodos están caídos: levantar primero el que tenía los datos más nuevos (el que fue líder por última
   vez, ver `patronictl history`) y después el otro: `docker start rayuela-patroni1 rayuela-patroni2`.
3. Esperar 40 segundos y volver a ejecutar `patronictl list`.
4. Si pasados 2 minutos sigue sin líder y los dos nodos y los etcd están sanos, reiniciar los nodos de a uno:
   `docker restart rayuela-patroni1`, esperar y repetir con el segundo. No usar `docker compose down -v`.

**Verificación:** hay un `Leader`; el panel de HAProxy muestra un servidor verde en `primary`;
`curl http://localhost/api/health` devuelve `conectada`.

**Escalar si:** los logs indican corrupción de datos o `invalid checkpoint record`: restaurar un backup (ver
03, escenario INF-05) y avisar al responsable de datos.

## DB-05. Falla uno o más etcd (ETCD_DEGRADADO o ETCD_SIN_QUORUM)

**Síntomas:** `etcdctl endpoint health --cluster` informa un nodo `unhealthy` o no responde. Con 2 de 3 etcd vivos el
servicio sigue normal (`ETCD_DEGRADADO`). Con solo 1 vivo no hay quórum (`ETCD_SIN_QUORUM`): Patroni no puede renovar
el permiso de líder y **el líder se degrada a solo lectura** por seguridad; las escrituras fallan.

**Solución:**
```bash
docker ps -a --filter name=rayuela-etcd --format '{{.Names}}\t{{.Status}}'
docker start rayuela-etcd2                      # reemplazar por el etcd caido
docker exec rayuela-etcd1 etcdctl endpoint health --cluster
```
Los datos de etcd están en volúmenes (`rayuela_etcd1_data`, etc.), por eso un etcd que se reinicia vuelve con su
estado. Cuando vuelve el quórum, Patroni recupera el líder solo; si no ocurre en un minuto, reiniciar el líder con
`docker restart rayuela-patroni1`.

**Verificación:** los tres etcd `healthy` y `patronictl list` con un `Leader`.

## DB-06. Retraso de replicación alto

**Síntomas:** alerta `PostgresReplicacionConRetraso`; `Lag in MB` mayor a 0 sostenido; `pg_stat_replication` muestra
`sync_state` en `async` o `catchup`.

**Causas:** carga de escrituras muy alta, la réplica sin CPU o disco, o la red entre contenedores saturada.

**Diagnóstico:**
```bash
docker exec rayuela-patroni1 psql -U postgres -c "select application_name, state, sync_state, pg_wal_lsn_diff(sent_lsn, replay_lsn) as bytes_pendientes from pg_stat_replication"
docker stats --no-stream rayuela-patroni1 rayuela-patroni2
```

**Solución:** reducir la carga (por ejemplo, pausar una carga masiva), liberar CPU del equipo y esperar. Si el
retraso no baja en 10 minutos, ver DB-07.

**Riesgo:** con retraso alto, si el líder cae podría perderse lo último escrito. Con el modo sincrónico activo esto
solo ocurre mientras la réplica esté en `catchup` y el sistema esté en modo asincrónico.

## DB-07. Un nodo no vuelve a streaming o quedó con datos viejos (reinicializar la réplica)

**Síntomas:** `patronictl list` muestra la réplica en `stopped`, `start failed`, `creating replica` por mucho tiempo, o
con retraso que no baja; en sus logs: `requested WAL segment has already been removed` o `timeline ... diverged`.

**Solución:** reinicializar la réplica copiando de nuevo todo desde el líder. Es seguro: no toca al líder.
```bash
docker exec rayuela-patroni1 patronictl reinit rayuela-cluster patroni2 --force   # patroni2 = la replica a reconstruir
docker exec rayuela-patroni1 patronictl list                                       # esperar Sync Standby / streaming
```
Ejecutar el comando desde el nodo líder o cualquier nodo sano. No combinar `reinit` con `restart` del mismo nodo: el
segundo falla con `reinitialize already in progress`; esperar a que termine.

**Verificación:** réplica en `streaming` con retraso 0 y `pg_stat_replication` en `sync`.

## DB-08. Error "cannot execute INSERT in a read-only transaction"

**Síntomas:** el backend registra `cannot execute INSERT/UPDATE/DELETE in a read-only transaction`.

**Causas:** (a) el pedido llegó a un nodo que acaba de dejar de ser líder durante un failover; es transitorio y el
backend lo reintenta solo; (b) la aplicación se conectó por el puerto 5001 (lectura) para escribir; (c) el líder quedó
en solo lectura por falta de quórum de etcd (DB-05).

**Solución:** si persiste más de un minuto, verificar `patronictl list` y la salud de etcd. Confirmar que el backend
tiene `DB_HOST=haproxy` y `DB_PORT=5000` para escribir y `DB_READ_PORT=5001` solo para leer
(`docker exec rayuela-backend-blue env | grep DB_`).

## DB-09. El disco se llena por registros WAL acumulados

**Síntomas:** el volumen de un nodo crece sin parar; en los logs `No space left on device`; `docker system df` muestra
volúmenes enormes.

**Causa:** el líder guarda los registros de transacciones para una réplica que lleva mucho tiempo caída (usa un slot
de replicación).

**Solución:** levantar la réplica (DB-02). Si no va a volver pronto, reinicializarla después (DB-07). Liberar espacio de
Docker no usado con `docker system prune` (no usar `--volumes`). Revisar cuánto retiene cada slot:
```bash
docker exec rayuela-patroni1 psql -U postgres -c "select slot_name, active, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) as retenido from pg_replication_slots"
```

## DB-10. Error "could not resize shared memory segment" o "No space left on device" en /dev/shm

**Causa:** el contenedor tiene poca memoria compartida (`/dev/shm`) para consultas o mantenimiento en paralelo.

**Solución:** los nodos Patroni ya tienen `shm_size: 256mb` en `compose.yaml`. Si el error aparece en otro
contenedor de PostgreSQL, agregarle `shm_size: 256mb`. Como alternativa inmediata, ejecutar la operación sin
paralelismo (por ejemplo `VACUUM (PARALLEL 0)`).

## DB-11. Errores de conexión: "too many connections", "password authentication failed"

- **`remaining connection slots are reserved` / `too many connections`:** el backend (pool de hasta 20 conexiones por
  slot) o herramientas externas consumen todas las conexiones. Ver conexiones con
  `docker exec rayuela-patroni1 psql -U postgres -c "select usename, application_name, count(*) from pg_stat_activity group by 1,2 order by 3 desc"`.
  Cerrar las que sobren o reiniciar el backend.
- **`password authentication failed for user "postgres"`:** la clave del secreto `db_password` no coincide con la de
  la base. Ocurre si se rotó el secreto sin ejecutar `ALTER ROLE` en la base, o si se recreó el volumen con otra clave.
  Ver 04, escenario SEG-03. No volver a generar secretos (`init-secrets.js --nuevos`) con una base existente.

## DB-12. Cambiar de líder a propósito para hacer mantenimiento

1. Verificar que la réplica está en `streaming` con retraso 0.
2. Cambio ordenado: ver DB-03 (`patronictl switchover`).
3. Hacer el mantenimiento sobre el nodo que ahora es réplica (por ejemplo `docker restart rayuela-patroni1`).
4. Confirmar que vuelve a `streaming` y, si se quiere, devolver el liderazgo con otro `switchover`.

## DB-13. Arranque en frío (primer arranque o después de borrar los volúmenes)

En el primer arranque, Patroni inicializa un clúster nuevo: el primer nodo en elegir líder crea la base y los usuarios
(`replicator`, `monitorizacion`) desde los Docker Secrets, y el segundo se clona. Tarda 1 a 2 minutos; el backend espera
hasta que HAProxy ve un líder (su healthcheck depende de eso) y reintenta la conexión al arrancar.
Si el volumen de datos ya existe, **los usuarios y claves no se vuelven a crear**: para cambiar una clave hay que
usar `ALTER ROLE` (ver 04, SEG-03). Los datos de prueba (catálogo, volumen masivo) no se cargan solos: `node seed.js`
y los scripts de `database/`.

## DB-14. Volver al PostgreSQL de un solo nodo (rollback de la arquitectura)

El diseño de alta disponibilidad no borra el volumen del PostgreSQL anterior (`rayuela_postgres_data`). Para volver hay
que usar la versión anterior del `compose.yaml` (el commit previo a este diseño) y levantar los servicios por nombre.
Los datos escritos en el clúster nuevo no pasan al volumen viejo; si hay que conservarlos, hacer antes un backup con
`docker exec rayuela-backup sh /usr/local/bin/backup.sh` y restaurarlo (INF-05).
