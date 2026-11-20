# Manual operativo de Rayuela — 04. Seguridad, secretos e incidentes

## Cómo se manejan los secretos

Las claves viven en archivos de `secrets/` (ignorada por Git) y entran a los contenedores como Docker Secrets en
`/run/secrets/<nombre>`; no aparecen en `docker inspect`. Se crean con `node scripts/init-secrets.js` (solo los que
faltan). Archivos principales: `db_password` (superusuario `postgres`), `replicator_password` (replicación),
`monitor_password` (usuario `monitorizacion`), `jwt_secret` (firma de sesiones), `gemini_api_key`,
`mercadopago_access_token`, `email_pass`, `grafana_admin_password`, `pgadmin_password`, `honeypot_webhook_token`,
`qdrant_api_key`, `diagnostico_webhook_token` y los de Mantis. Hay una copia cifrada con
`node scripts/backup-secrets.js respaldar <ruta fuera del repo>`.

Regla: ninguna clave ni token se sube al repositorio, se pega en un ticket ni se envía a una IA.

## SEG-01. Se filtró un secreto (clave, token, contraseña)

1. **Contener:** revocar primero la clave en el proveedor (Gemini, Mercado Pago, correo). Una clave filtrada se
   considera comprometida aunque se borre el commit.
2. **Recuperar:** claves de terceros: pegar la nueva en el archivo de `secrets/` y recrear los servicios que la usan
   (`docker compose --profile blue up -d --no-deps --force-recreate backend-blue`). Claves propias (`jwt_secret`,
   `grafana_admin_password`, `pgadmin_password`): `node scripts/rotate-secrets.js <secreto> --si`.
3. Hacer una copia cifrada nueva de `secrets/` y registrar el incidente en MantisBT.
4. Si estuvo en el historial de Git, avisar al grupo y evaluar reescribir el historial. El pipeline tiene escaneo de
   secretos (gitleaks) que alerta en cada PR.

## SEG-02. Fuerza bruta o robo de credenciales

**Señal:** pico de la métrica `rayuela_rate_limit_hits_total`, muchas respuestas 429 en el login, o muchos fallos en
`historial_accesos`.
**Contención:** bloquear las IP de origen en el borde (regla de IP en Cloudflare si el acceso es por el túnel; un
`deny` en nginx por `$remote_addr` bloquearía a todos porque ve la IP del salto anterior) y forzar el cambio de
contraseña de las cuentas afectadas.
**Recuperación:** rotar `jwt_secret`, que cierra todas las sesiones abiertas: `node scripts/rotate-secrets.js jwt_secret --si`.
Revisar `auditorias` por acciones sospechosas:
```bash
docker exec rayuela-patroni1 psql -U postgres -d rayuela -c "select fecha, accion, \"tablaAfectada\", \"usuarioId\" from auditorias order by id desc limit 50"
```
Las cuentas semilla `admin@sistema.com` y `empleado@sistema.com` tienen claves por defecto conocidas: cambiarlas en
cualquier entorno expuesto.

## SEG-03. La clave de la base de datos no coincide o hay que rotarla

**Síntomas:** `password authentication failed for user "postgres"` (o `"monitorizacion"`, `"replicator"`) en el
backend, PgBouncer, el backup o los exportadores.

**Causas:** se cambió el archivo de `secrets/` sin cambiar la clave dentro de la base, o se volvió a crear un volumen
con otra clave (los usuarios solo se crean al inicializar el clúster por primera vez).

**Procedimiento de rotación de `db_password` (a mano; el script `rotate-secrets.js` todavía apunta al PostgreSQL de un
solo nodo y no sirve para las claves de la base):**
1. Cambiar la clave en el líder (se replica sola): `docker exec rayuela-patroni1 psql -U postgres -c "ALTER ROLE postgres PASSWORD 'NUEVA'"`
   (ejecutarlo en el nodo que sea líder; ver `patronictl list`).
2. Escribir la clave nueva en `secrets/db_password` (sin salto de línea extra).
3. Recrear los servicios que usan el secreto: `docker compose --profile blue up -d --force-recreate backend-blue backup pgbouncer`.
   Los nodos Patroni leen `db_password` al arrancar para conectarse entre sí: recrearlos **de a uno** (primero la
   réplica, esperar `streaming`, luego el líder con un `switchover` previo): `docker compose up -d --force-recreate patroni2`.
4. Recargar nginx: `docker exec rayuela-nginx-proxy nginx -s reload`. Verificar con `curl http://localhost/api/health`.

Para `monitor_password`: `ALTER ROLE monitorizacion PASSWORD '...'` en el líder, actualizar el archivo y recrear
`postgres_exporter1` y `postgres_exporter2`. Para `replicator_password`: `ALTER ROLE replicator PASSWORD '...'` en el
líder, actualizar el archivo y recrear los dos nodos Patroni de a uno.

No ejecutar `node scripts/init-secrets.js --nuevos` con una base existente: generaría claves que la base no conoce.

## SEG-04. Alerta del honeypot (/api/admin/reset-all)

El endpoint trampa no ejecuta nada y responde 401 como una ruta protegida. Cada acceso queda en la tabla `auditorias`
(acción `HONEYPOT`, con IP, X-Forwarded-For, User-Agent, método, ruta y cabeceras sin el valor de Authorization ni
Cookie) y n8n abre un ticket `[HONEYPOT]` en MantisBT.

1. Abrir el ticket y ver IP, User-Agent y ruta. Consultar la base:
   `docker exec rayuela-patroni1 psql -U postgres -d rayuela -c "select id, fecha, detalle from auditorias where accion = 'HONEYPOT' order by id desc limit 20"`.
2. Buscar la misma IP en el log y en `historial_accesos`: `docker logs rayuela-backend-blue 2>&1 | grep honeypot`.
3. Si fue solo exploración (un escáner): registrar y cerrar. Si la IP también tuvo logins o accesos válidos: nivel Alto,
   bloquear la IP en el borde y seguir con SEG-02.
El honeypot detecta y avisa; no bloquea. Simulacro: `curl -i -X POST http://localhost/api/admin/reset-all` debe devolver 401.

## SEG-05. Ransomware o pérdida de datos

**Señal:** archivos cifrados, base ilegible o servicios caídos sin causa.
**Contención:** aislar el equipo (cortar la red, `docker compose stop`). No pagar ni reiniciar sin conservar
evidencia; dejar intactos los volúmenes hasta analizarlos.
**Recuperación:** restaurar el último backup válido en una base nueva y verificarla antes de apuntar la aplicación a ella
(manual 03, INF-05). La réplica **no es un backup**: replica también los borrados. Los backups hoy están en el mismo
equipo y volumen Docker que los datos: un ransomware en el equipo los cifra juntos; la mejora pendiente es una copia
cifrada fuera del equipo.

## SEG-06. Vulnerabilidad nueva (Trivy, ZAP, dependencias)

Registrar en MantisBT con severidad y pasos de reproducción; corregir con un PR que pase los checks obligatorios
(tests, Trivy y gitleaks); repetir el escaneo para confirmar. El pipeline de CI corta con vulnerabilidades CRITICAL o
HIGH de la imagen.

## SEG-07. Exposición de interfaces administrativas

Puertos publicados a propósito y solo en `127.0.0.1`: pgAdmin 5050, Grafana 3001, n8n 5678, Mantis 8081, Prometheus
9091, HAProxy 7000. El puerto 80 (nginx) es el público. La base de datos (Patroni 5432, etcd 2379, Qdrant 6333) no
se publica al equipo. **PgBouncer publica el puerto 6432 en todas las interfaces**: restringirlo a `127.0.0.1` o
quitarlo si no se usa. Con el túnel de Cloudflare activo, nginx publica todo `/api`, incluidos `/api/metrics` y
`/api/docs`; conviene bloquearlos hacia afuera.

## SEG-08. Cierre de todo incidente

Completar el ticket de MantisBT con: cronología (cuándo se detectó, quién y qué se hizo), causa raíz, acciones de
contención y recuperación, qué quedó pendiente y qué control nuevo evitaría que se repita (se convierte en una
tarjeta o un PR).
