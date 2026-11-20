# Manual operativo de Rayuela — 00. Arquitectura, comandos básicos y códigos de evento

Este manual es la base de conocimiento del asistente de diagnóstico (n8n + Qdrant + Gemini). Está escrito para que
una persona del equipo pueda resolver una falla de la plataforma Rayuela siguiendo pasos concretos. Cada escenario
tiene síntomas, causa probable, diagnóstico, solución y verificación.

## Mapa de la plataforma

Rayuela corre en Docker Compose (red interna `rayuela-network`). El tráfico entra por nginx y llega al backend; el
backend habla con la base de datos a través de HAProxy. La base de datos NO se publica al equipo anfitrión. La aplicación usa la base `rayuela` dentro del clúster.

| Componente | Contenedor | Puerto / acceso | Para qué sirve |
|---|---|---|---|
| Proxy inverso | `rayuela-nginx-proxy` | 80 (público) | Enruta `/api` al backend activo y el resto al frontend |
| Frontend (Angular) | `rayuela-frontend` | interno | Interfaz web |
| Backend (Express) | `rayuela-backend-blue` o `rayuela-backend-green` | interno 3000 | API REST. Un solo slot activo a la vez |
| Punto de entrada a la base | `rayuela-haproxy` | interno 5000 (escritura) y 5001 (lectura); panel en `http://127.0.0.1:7000` | Dirige las escrituras al líder y las lecturas al líder o a la réplica |
| Base de datos (2 nodos) | `rayuela-patroni1`, `rayuela-patroni2` | interno 5432 y API de Patroni 8008 | PostgreSQL 16 con Patroni: uno es líder y el otro réplica sincrónica |
| Árbitro del clúster | `rayuela-etcd1`, `rayuela-etcd2`, `rayuela-etcd3` | interno 2379 | Guarda quién es el líder. Tolera la caída de uno |
| Pool de conexiones | `rayuela-pgbouncer` | 6432 | Agrupa conexiones hacia HAProxy:5000 |
| Administración de la base | `rayuela-pgadmin` | `http://127.0.0.1:5050` | Cliente web de PostgreSQL |
| Backups | `rayuela-backup` | interno | Copia diaria a las 03:00 en el volumen `rayuela_backups_data` |
| Métricas | `rayuela-prometheus` | `http://127.0.0.1:9091` | Recolecta métricas |
| Paneles | `rayuela-grafana` | `http://127.0.0.1:3001` | Dashboards |
| Logs | `rayuela-loki`, `rayuela-promtail` | 3100 | Logs centralizados |
| Recursos | `rayuela-node-exporter`, `rayuela-cadvisor` | 9100 y 8080 | CPU, memoria, disco y contenedores |
| Exportadores de PostgreSQL | `rayuela-postgres-exporter1`, `rayuela-postgres-exporter2` | 9187 | Métricas de cada nodo |
| Automatización | `rayuela-n8n` | `http://127.0.0.1:5678` | Flujos de monitoreo, aviso y diagnóstico con IA |
| Base vectorial | `rayuela-qdrant` | interno 6333 | Guarda este manual para el asistente |
| Incidencias | `rayuela-mantis`, `rayuela-mantis-db` | `http://127.0.0.1:8081` | MantisBT y su base MariaDB |
| Túnel a Internet | `rayuela-tunnel` | — | Cloudflare Tunnel (URL pública aleatoria) |

## Comandos básicos de diagnóstico

```bash
docker ps --format '{{.Names}}\t{{.Status}}'                 # estado de todos los contenedores
docker ps -a --filter status=exited --filter status=restarting   # los que se cayeron o reinician
docker logs --tail 100 rayuela-backend-blue                 # ultimas lineas de log de un servicio
docker inspect -f '{{.State.Health.Status}}' rayuela-backend-blue   # healthy / unhealthy
curl -s http://localhost/api/health                         # salud del backend y de su conexion a la base
docker exec rayuela-patroni1 patronictl list                # estado del clúster de base de datos
docker stats --no-stream                                    # CPU y memoria por contenedor
docker system df                                            # espacio usado por Docker
```

La respuesta de `/api/health` incluye `baseDeDatos`: `conectada` o `desconectada` y, si falla, el texto del error.

## Códigos de evento que genera el monitor de n8n

El flujo "IA-03 Monitor de salud de la plataforma" revisa la plataforma cada 60 segundos y envía eventos con estos
códigos al flujo de diagnóstico. Cada código remite a una sección de este manual.

| Código | Significado | Ver |
|---|---|---|
| `NODO_DB_CAIDO` | Un nodo de base de datos (Patroni) no responde | 01, escenarios DB-01 y DB-02 |
| `LIDER_CAMBIO` | Cambió el líder de la base: hubo un failover o un cambio ordenado | 01, DB-03 |
| `SIN_LIDER` | El clúster no tiene líder: las escrituras están detenidas | 01, DB-04 |
| `SIN_REPLICA` | Queda un solo nodo de base de datos, sin réplica | 01, DB-02 |
| `ETCD_DEGRADADO` | Falta uno de los tres etcd (el clúster sigue funcionando) | 01, DB-05 |
| `ETCD_SIN_QUORUM` | Quedan menos de dos etcd: Patroni no puede elegir líder | 01, DB-05 |
| `HAPROXY_SIN_PRIMARIO` | HAProxy no ve ningún nodo líder al que escribir | 01, DB-04 |
| `BACKEND_CAIDO` | `/api/health` no responde | 02, APP-01 |
| `BACKEND_SIN_BASE_DE_DATOS` | El backend responde pero informa que no tiene base de datos | 02, APP-02 |
| `PLATAFORMA_RECUPERADA` | Todo volvió a la normalidad | — |

## Reglas generales antes de actuar

1. Primero diagnosticar con los comandos de lectura (`docker ps`, `docker logs`, `patronictl list`); no borrar volúmenes
   ni ejecutar `docker compose down -v` mientras no se sepa cuál es el problema: borra datos.
2. Anotar la hora y el síntoma para el informe del incidente en MantisBT.
3. No levantar el servicio `cloudflared` por accidente: `docker compose up -d` sin nombres de servicio lo levanta y
   publica la aplicación en Internet. Levantar los servicios por nombre.
4. Nunca pegar contraseñas ni tokens en un ticket, un correo o una consulta a una IA.
