# Manual operativo de Rayuela — 03. Infraestructura, backups y observabilidad

## INF-01. Prometheus no recolecta un servicio (target caído)

**Síntomas:** alerta `PrometheusTargetMissing` o `BackendDown`; en `http://127.0.0.1:9091/targets` un objetivo figura
`DOWN`. Los jobs son: `rayuela-backend`, `node-exporter`, `cadvisor`, `postgres-exporter` (un exportador por nodo),
`patroni` (API de cada nodo) y `prometheus`.

**Diagnóstico y solución:**
```bash
curl -s http://127.0.0.1:9091/api/v1/targets | head -c 600          # o abrir /targets en el navegador
docker ps -a --format '{{.Names}}\t{{.Status}}' | grep -E "prometheus|exporter|cadvisor|patroni|backend"
docker logs --tail 40 rayuela-postgres-exporter1
```
- Un exportador de PostgreSQL caído casi siempre significa que su nodo está caído o que la clave `monitor_password`
  no coincide: ver manual 01 (DB-01) y 04 (SEG-03).
- `rayuela-backend` DOWN: el backend usa el slot `backend-blue`; si está activo `backend-green`, hay que cambiar el
  objetivo en `monitoring/prometheus/prometheus.yml` y recargar con `docker restart rayuela-prometheus`.
- Si se cambió `prometheus.yml` o `rules.yml`, reiniciar: `docker restart rayuela-prometheus`.

**Verificación:** todos los objetivos `UP` en `/targets` (el nodo réplica de Patroni también debe estar `UP`).

## INF-02. Grafana no muestra datos

**Diagnóstico:** `docker ps --filter name=rayuela-grafana`; entrar a `http://127.0.0.1:3001` (usuario `admin`, clave en
`secrets/grafana_admin_password`); en Connections > Data sources probar el origen Prometheus. Si la prueba falla,
Prometheus está caído (INF-01). Si Prometheus responde pero los paneles dicen "No data", ampliar el rango de tiempo y
verificar que el servicio emita métricas. Los dashboards se cargan desde `monitoring/grafana/dashboards`.

## INF-03. Loki responde 503 o no hay logs

**Causa frecuente:** Loki tarda unos 15-30 segundos en estar listo después de arrancar y mientras tanto `/ready`
devuelve 503 ("Ingester not ready"); es normal.

**Solución:** esperar y probar `curl -s http://127.0.0.1:3100/ready`. Si sigue en 503 tras 2 minutos:
`docker logs --tail 50 rayuela-loki`. Si falla Promtail (no llegan logs nuevos): `docker logs --tail 30 rayuela-promtail`
y verificar que `/var/run/docker.sock` esté montado; reiniciar con `docker restart rayuela-promtail`.

## INF-04. Disco o memoria llenos

**Síntomas:** `No space left on device`, contenedores que se reinician, PostgreSQL que no escribe.

**Diagnóstico:**
```bash
docker system df
docker stats --no-stream
docker exec rayuela-backup du -sh /backups
```
**Solución, de menos a más agresivo:** borrar contenedores detenidos e imágenes sin uso (`docker system prune`),
borrar la caché de construcción (`docker builder prune`), eliminar backups viejos de `/backups` (se conservan 7 días
solos). **No usar `docker system prune --volumes` ni `docker compose down -v`: borran los datos de la base.**
Si el espacio lo ocupa un nodo de PostgreSQL, ver manual 01, DB-09.

## INF-05. Falló el backup o hay que restaurar uno

**Cómo funciona:** el contenedor `rayuela-backup` ejecuta `pg_dump` todos los días a las 03:00 contra el líder (vía
HAProxy:5000) y guarda `rayuela_AAAA-MM-DD_HHMM.sql.gz` en el volumen `rayuela_backups_data`; conserva 7 días.

**Comprobar el estado:**
```bash
docker exec rayuela-backup ls -lh /backups
docker logs --tail 30 rayuela-backup
docker exec rayuela-backup sh /usr/local/bin/backup.sh      # forzar un backup ahora
```
**Si el backup falla:** casi siempre es que no hay líder (manual 01, DB-04), la clave `db_password` no coincide
(04, SEG-03) o el volumen está lleno (INF-04). Un backup de menos de unos KB es sospechoso (base vacía o error).

**Restaurar (siempre primero en una base nueva, sin pisar la original):**
```bash
docker exec rayuela-backup sh /usr/local/bin/restore.sh /backups/rayuela_AAAA-MM-DD_HHMM.sql.gz rayuela_restore
docker exec rayuela-patroni1 psql -U postgres -d rayuela_restore -c "select count(*) from usuarios"   # validar
```
Para que la aplicación use la base restaurada, cambiar `DB_NAME` (en `.env` o en el compose) por `rayuela_restore`
y recrear el backend. La réplica de PostgreSQL **no reemplaza al backup**: replica también los borrados y los cambios
erróneos. Se pierde como máximo el trabajo desde el último backup (hasta 24 horas).

## INF-06. n8n no responde o los flujos no se ejecutan

**Diagnóstico:**
```bash
docker ps --filter name=rayuela-n8n
docker logs --tail 80 rayuela-n8n
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5678/healthz
```
**Causas:** el contenedor está caído (`docker compose up -d n8n`); un flujo está inactivo (activarlo con el interruptor
de la esquina superior derecha del flujo); falta una credencial (el nodo muestra un triángulo rojo; crear la credencial
y asignarla); una ejecución falló (menú Executions > ver el nodo en rojo y su error). Los flujos son:
`IA-01 Carga del manual en Qdrant` (manual), `IA-02 Diagnóstico de fallas con IA` (webhook) e
`IA-03 Monitor de salud de la plataforma` (cada 60 segundos). Si se perdió la configuración, volver a importar con
`python3 n8n/scripts/bootstrap_ia.py`.

## INF-07. El asistente de diagnóstico no encuentra nada en el manual (Qdrant)

**Síntomas:** el correo del asistente dice "no encontré información en el manual" para fallas que sí están
documentadas; la ejecución de IA-02 falla en el nodo de Qdrant.

**Diagnóstico:**
```bash
docker ps --filter name=rayuela-qdrant
docker logs --tail 30 rayuela-qdrant
```
**Soluciones:** (1) la colección está vacía o no existe: ejecutar el flujo `IA-01 Carga del manual en Qdrant` (botón
Test workflow) y comprobar que termina sin error; (2) error 401/403 de Qdrant: la clave de la credencial "Qdrant"
de n8n no coincide con `secrets/qdrant_api_key`; recrear la credencial con `python3 n8n/scripts/bootstrap_ia.py`;
(3) error de Gemini en los embeddings: ver APP-07 (clave o cuota). Después de editar los archivos de
`docs/manual-operativo/`, volver a ejecutar IA-01: reemplaza el contenido anterior.

## INF-08. MantisBT no abre o no registra incidencias

`docker ps --filter name=rayuela-mantis`; Mantis es de perfil opcional: `docker compose --profile mantis up -d mantis-db mantis`.
Entrar a `http://127.0.0.1:8081`. Si responde 500 o pide instalar, revisar `docker logs --tail 50 rayuela-mantis` y que
`rayuela-mantis-db` esté `healthy`. Los flujos de n8n que crean incidencias usan la credencial "MantisBT API Token".

## INF-09. El túnel de Cloudflare está caído o cambió la URL

**Cómo funciona:** el contenedor `rayuela-tunnel` (Cloudflare Tunnel rápido) publica `http://nginx-proxy:80` en una
dirección `https://xxxx.trycloudflare.com`. **La URL es aleatoria y cambia cada vez que el contenedor se reinicia.**

**Diagnóstico y solución:**
```bash
docker ps -a --filter name=rayuela-tunnel
docker logs --tail 30 rayuela-tunnel
bash scripts/get-tunnel-url.sh                    # imprime la URL publica actual
docker compose up -d cloudflared                  # levanta el tunel (publica la app en Internet)
```
Si la URL anterior responde 530 o "error 1033", el túnel se reinició o está apagado. Mientras el túnel esté arriba,
cualquiera con la URL accede a la aplicación y a `/api/metrics` y `/api/docs`: apagar el túnel cuando no se usa
(`docker stop rayuela-tunnel`).

## INF-10. PgBouncer rechaza conexiones o está saturado

PgBouncer (`rayuela-pgbouncer`, puerto 6432) agrupa conexiones hacia HAProxy:5000 en modo transacción, con hasta 150
clientes y 25 conexiones al servidor. Síntoma: `no more connections allowed` o `pgbouncer cannot connect to server`.
Revisar `docker logs --tail 50 rayuela-pgbouncer`. Si dice `server login failed`, la clave `db_password` no coincide
(04, SEG-03); si no puede conectar al servidor, falta el líder (manual 01, DB-04). El backend no pasa por PgBouncer: usa HAProxy
directamente.

## INF-11. Los contenedores no arrancan después de reiniciar el equipo o Docker

1. Verificar que Docker Desktop esté en ejecución: `docker info`.
2. Ver qué falta: `docker ps -a --format '{{.Names}}\t{{.Status}}'`. Los servicios tienen `restart: unless-stopped`, así
   que deberían volver solos; un servicio detenido a mano no vuelve.
3. Orden recomendado si hay que levantar a mano (por nombre, **sin** cloudflared):
   `docker compose --profile blue up -d etcd1 etcd2 etcd3 patroni1 patroni2 haproxy` y esperar a que HAProxy esté
   `healthy`, luego `docker compose --profile blue up -d backup pgbouncer pgadmin backend-blue frontend nginx-proxy
   postgres_exporter1 postgres_exporter2 prometheus grafana loki promtail cadvisor n8n qdrant`.
4. Después de recrear el backend, recargar nginx: `docker exec rayuela-nginx-proxy nginx -s reload`.

## INF-12. Un puerto está ocupado o un servicio no inicia en Windows

- `port is already allocated`: otro programa usa el puerto (80, 5050, 5678, 7000, 8081, 9091, 3001). Cerrar ese programa
  o cambiar el puerto con la variable correspondiente (`PGADMIN_PORT`, `N8N_PORT`, `MANTIS_PORT`).
- `node-exporter` falla en Docker Desktop para Windows con `path / is mounted on / but it is not a shared or slave
  mount`: es una limitación conocida; el resto del stack funciona. Levantar los servicios por nombre sin él.
- Los scripts `.sh` con saltos de línea de Windows (CRLF) fallan con `illegal option` o `\r`: deben guardarse con LF.

## INF-13. CPU o memoria altas

`docker stats --no-stream` muestra qué contenedor consume más. Causas típicas: carga masiva o consulta pesada sobre
`auditorias` (PostgreSQL), `rayuela-cadvisor` o `rayuela-loki` con muchos logs, o muchos contenedores a la vez en un
equipo con poca RAM. Docker Desktop tiene un límite de memoria propio (Settings > Resources): subirlo si hay muertes
por memoria (`OOMKilled`).
