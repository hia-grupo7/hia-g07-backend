# Manual operativo de Rayuela — 02. Aplicación: backend, nginx y frontend

## Cómo funciona

- El navegador llega a nginx (`rayuela-nginx-proxy`, puerto 80). Las rutas `/api/...` van al backend activo
  (`rayuela-backend-blue` o `rayuela-backend-green`, un slot a la vez); el resto va al frontend.
- El backend (Node.js + Express + Sequelize) guarda todo en PostgreSQL a través de HAProxy. Sus claves
  (`DB_PASSWORD`, `JWT_SECRET`, Gemini, Mercado Pago, correo) las lee de Docker Secrets en `/run/secrets`.
- `GET /api/health` responde 200 con `baseDeDatos: conectada` cuando todo va bien, y 503 con el error si no hay base.
- Durante un failover de la base el backend **espera y reintenta** (hasta unos 49 segundos) en vez de devolver error.
- Al arrancar, el backend reintenta conectarse a la base hasta 30 veces cada 3 segundos; si no lo logra, termina con
  error y Docker lo reinicia.

## APP-01. El backend no responde (evento BACKEND_CAIDO)

**Síntomas:** `curl http://localhost/api/health` falla o devuelve 502/503/504; el contenedor figura `unhealthy`,
`Exited` o `Restarting`.

**Diagnóstico:**
```bash
docker ps -a --filter name=rayuela-backend --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
docker logs --tail 100 rayuela-backend-blue
docker inspect -f '{{.State.Health.Status}} {{.State.OOMKilled}} {{.State.ExitCode}}' rayuela-backend-blue
docker exec rayuela-backend-blue wget -qO- http://127.0.0.1:3000/api/health
```
Si el comando interno responde bien pero por nginx falla, el problema es nginx (APP-03).

**Causas y solución:**
- **No puede conectarse a la base** (`BD no disponible`, `Connection terminated`): resolver primero la base
  (manual 01, escenarios DB-01 a DB-05). El backend se recupera solo cuando vuelve un líder.
- **Falta un secreto o está mal** (`ENOENT /run/secrets/...`, `JWT_SECRET no está configurada`): revisar que existan
  los archivos de `secrets/` y ejecutar `node scripts/init-secrets.js --valores-actuales` (solo crea los que faltan).
- **Se quedó sin memoria** (`OOMKilled true`): subir la memoria de Docker o reducir la carga.
- **Imagen inexistente** (`pull access denied for rayuela-backend`): construir la imagen con
  `docker build -t rayuela-backend:1.1.0 .` o definir `BACKEND_BLUE_IMAGE`.
- **Error de código tras un despliegue:** hacer rollback (APP-05).

Para reiniciarlo: `docker compose --profile blue up -d --no-deps --force-recreate backend-blue`.

**Verificación:** `docker inspect -f '{{.State.Health.Status}}' rayuela-backend-blue` devuelve `healthy` y
`curl http://localhost/api/health` devuelve 200.

## APP-02. El backend está vivo pero sin base de datos (evento BACKEND_SIN_BASE_DE_DATOS)

**Síntomas:** `/api/health` devuelve 503 con `"baseDeDatos":"desconectada"` y un campo `error`
(`getaddrinfo ENOTFOUND`, `Connection terminated unexpectedly`, `timeout expired`, `ECONNREFUSED`).

**Causa:** el backend no puede llegar a HAProxy o HAProxy no tiene líder.

**Solución:** `docker exec rayuela-patroni1 patronictl list` y seguir el manual 01 (DB-04 si no hay líder). Si el error
es `ENOTFOUND haproxy`, el contenedor `rayuela-haproxy` no existe o no está en `rayuela-network`:
`docker compose --profile blue up -d haproxy`.
Mientras haya un failover en curso (menos de 40 segundos) no hay que hacer nada.

## APP-03. nginx devuelve "502 Bad Gateway" aunque el backend está sano

**Síntomas:** el navegador muestra 502; `docker exec rayuela-backend-blue wget -qO- http://127.0.0.1:3000/api/health`
funciona pero `curl http://localhost/api/health` devuelve `502`.

**Causa:** nginx resolvió la IP del backend al arrancar y no se enteró de que el contenedor se recreó y cambió de
IP (ocurre tras `docker compose up` que recrea el backend, un cambio de slot o una actualización de imagen).

**Solución:**
```bash
docker exec rayuela-nginx-proxy nginx -s reload
curl -s http://localhost/api/health
```
Si el 502 persiste, revisar que `nginx/conf.d/default.conf` apunte al slot que está levantado (`server backend-blue:3000;`).

## APP-04. La aplicación responde lento o con errores 5xx

**Diagnóstico:**
```bash
docker logs --tail 200 rayuela-backend-blue | grep -i -E "error|timeout"
docker stats --no-stream
curl -s -o /dev/null -w '%{http_code} %{time_total}s\n' http://localhost/api/libros
```
En Grafana (`http://127.0.0.1:3001`) revisar CPU y memoria de los contenedores y las conexiones activas de PostgreSQL.

**Causas frecuentes:**
- Un failover de base de datos en curso: las respuestas tardan 25-40 segundos y luego se normalizan (manual 01, DB-01).
- Consultas pesadas sobre tablas grandes (`auditorias` tiene millones de filas): verificar que existan los índices
  `idx_auditorias_*` (`\di` en psql) y que no se esté ejecutando una carga masiva.
- Falta de CPU o memoria en el equipo: cerrar otros programas o reducir servicios.
- Conexiones agotadas: ver manual 01, DB-11.

## APP-05. Despliegue defectuoso: volver a la versión anterior (rollback)

Aplicar el rollback primero y diagnosticar después si, tras un despliegue, falla `/api/health`, `/api/libros` no
devuelve un arreglo JSON, hay 5xx sostenidos o se rompe una función visible.

Niveles, del más rápido al más lento:
1. **Volver de slot (segundos):** si la versión anterior sigue en el otro slot, apuntar nginx a ese slot:
   ```bash
   sed -i "s|server backend-.*:3000;|server backend-blue:3000;|g" nginx/conf.d/default.conf
   docker exec rayuela-nginx-proxy nginx -s reload
   ```
   (cambiar `backend-blue` por el slot estable). Alternativa: `printf 'N\n' | bash scripts/switch-bluegreen.sh blue`.
2. **Redesplegar una imagen anterior (1 a 3 minutos):**
   `export BACKEND_BLUE_IMAGE=ghcr.io/hia-grupo7/hia-g07-backend:<version>` y
   `docker compose --profile blue up -d --no-deps --force-recreate backend-blue`, luego recargar nginx.
3. **Revertir el código:** `git revert <commit>` en una rama nueva y abrir un PR a `dev`.
4. **Restaurar la base de datos:** solo si la versión defectuosa dañó datos (ver 03, INF-05).

Pruebas de humo después de cada paso: `curl -s -o /dev/null -w "%{http_code}" http://localhost/api/health` debe dar
200 y `curl -s http://localhost/api/libros | head -c 1` debe imprimir `[`. El health check solo no alcanza: una versión
puede responder 200 en `/api/health` y devolver un contrato roto en `/api/libros`. No apagar el slot anterior hasta
validar la versión nueva. Las imágenes anteriores a la rotación de secretos (SEC-01) no sirven para volver atrás.

## APP-06. Respuestas 429 "Demasiados intentos"

**Causa:** es el límite de solicitudes: el login permite 5 intentos fallidos por minuto y por IP (el sexto recibe
429); el chat con IA permite 10 por minuto; también el segundo factor (2FA). No es una falla: es la protección contra
fuerza bruta.

**Qué hacer:** esperar el tiempo que indica el mensaje (menos de un minuto). Si un usuario legítimo queda bloqueado
repetidamente, revisar si detrás hay muchos usuarios con la misma IP (por ejemplo, el túnel) y ajustar las variables
`RATE_LIMIT_VENTANA_MS`, `RATE_LIMIT_LOGIN_MAX` y `RATE_LIMIT_CHAT_MAX` del backend. Un aumento fuerte de 429 en la
métrica `rayuela_rate_limit_hits_total` puede indicar un ataque de fuerza bruta (ver 04, SEG-02).

## APP-07. El chat con IA (Gemini) falla

**Síntomas:** `/api/chat` devuelve error o una respuesta genérica; en los logs aparece `API key not valid`,
`403`, `429 RESOURCE_EXHAUSTED`, `404 model not found` o `fetch failed`.

**Causas y solución:**
- **Clave vacía o inválida:** el archivo `secrets/gemini_api_key` está vacío o tiene una clave revocada. Pegar la clave
  real (sin saltos de línea de más) y recrear el backend: `docker compose --profile blue up -d --no-deps --force-recreate backend-blue`.
- **Cuota agotada (429):** esperar el reinicio de la cuota o usar otra clave/proyecto.
- **Modelo retirado o mal escrito (404):** cambiar el nombre del modelo en el código del servicio de chat.
- **Sin salida a Internet:** probar `docker exec rayuela-backend-blue wget -qO- https://generativelanguage.googleapis.com` para ver si hay conectividad.
La métrica `rayuela_gemini_requests_total` cuenta los usos. Nunca registrar la clave en logs ni tickets.

## APP-08. Fallan los pagos (Mercado Pago)

**Síntomas:** la métrica `rayuela_payment_failure_total` aumenta; el backend registra errores de Mercado Pago; el
checkout no se completa.

**Solución:** verificar que `secrets/mercadopago_access_token` tenga un token vigente (si se filtró, revocarlo y
generar otro: ver 04, SEG-01); revisar el estado de Mercado Pago; probar con una compra de prueba. Los tokens reales
no se guardan en el repositorio.

## APP-09. El catálogo aparece vacío o no se puede iniciar sesión

- **Catálogo vacío (`/api/libros` devuelve `[]`):** la base es nueva. Cargar el catálogo con `node seed.js` (o dentro de
  un contenedor temporal con la imagen del backend, apuntando a `DB_HOST=haproxy`, `DB_PORT=5000`).
- **No se puede iniciar sesión:** si es un usuario semilla, `admin@sistema.com` y `empleado@sistema.com` se crean solos
  al arrancar el backend. Si devuelve `Credenciales incorrectas`, es la clave. Si responde 500, ver APP-02. Para el
  código de verificación por correo (2FA) hace falta `secrets/email_pass` con una contraseña de aplicación de Gmail
  y `EMAIL_USER` en `.env`.

## APP-10. Restricciones únicas duplicadas en la base (usuarios_email_key1, key2...)

**Causa:** `sequelize.sync({ alter: true })` agregaba una restricción duplicada por tabla en cada arranque. Se corrigió:
`alter` ahora solo se usa con `DB_SYNC_ALTER=true`. Si vuelven a aparecer, el backend corre una imagen vieja.
Contarlas: `docker exec rayuela-patroni1 psql -U postgres -d rayuela -c "select conrelid::regclass, count(*) from pg_constraint where contype='u' and connamespace='public'::regnamespace group by 1"`.
Debe haber una sola por tabla (`usuarios`, `cupones`, `roles`). Reconstruir la imagen del backend con el código nuevo.

## APP-11. Frontend no carga o muestra pantalla en blanco

**Diagnóstico:** `docker ps --filter name=rayuela-frontend`, `docker logs --tail 50 rayuela-frontend`,
`curl -s -o /dev/null -w "%{http_code}" http://localhost/`. Si nginx responde pero el frontend no, recrear:
`docker compose --profile blue up -d --no-deps --force-recreate frontend` y luego `docker exec rayuela-nginx-proxy nginx -s reload`.
Si el navegador muestra errores de red hacia `/api`, ver APP-01 y APP-03.

## APP-12. Alerta del honeypot `/api/admin/reset-all`

Cualquier acceso a esa ruta se considera sospechoso: el backend lo guarda en la tabla `auditorias` (acción `HONEYPOT`)
y avisa a n8n, que abre un ticket `[HONEYPOT]` en MantisBT. Ver 04, SEG-04.
