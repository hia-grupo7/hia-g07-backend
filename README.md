# Rayuela — Backend API

API REST de **Rayuela Marketplace**, una librería online. Es el backend del Trabajo Práctico Integrador de
*Herramientas e Infraestructura para Aplicaciones (HIA)* — **Grupo 07**.

El frontend (Angular) vive en el repositorio hermano
[`hia-g07-frontend`](https://github.com/hia-grupo7/hia-g07-frontend).

---

## Arquitectura general

```
 ┌──────────────────┐    HTTP/JSON     ┌────────────────────────────┐        ┌──────────────┐
 │  Frontend        │ ───────────────► │  Backend (este repo)       │ ─────► │ PostgreSQL   │
 │  Angular 22 SPA  │ ◄─────────────── │  Node.js + Express 5       │ ◄───── │ (Sequelize)  │
 │  :4200           │                  │  :3000   /api/*            │        └──────────────┘
 └──────────────────┘                  └─────────────┬──────────────┘
                                                     │ servicios externos
                              ┌──────────────┬───────┴────────┬─────────────────┐
                              ▼              ▼                ▼                 ▼
                        Google Gemini   Mercado Pago   Google OAuth   SMTP (nodemailer)
                        (chat IA)       (pagos)        (login)        (correos)
```

El código sigue una estructura por capas:

```
app.js                 Aplicación Express: middlewares y rutas. Las rutas y middlewares nuevos van aquí, no en index.js (se prueba sin base de datos)
index.js               Arranque: sincronización de la BD y servidor HTTP
config/                Conexión a PostgreSQL (Sequelize) y roles iniciales
src/
  routes/              Definición de endpoints (/api/...)
  controllers/         Entrada/salida HTTP
  services/            Lógica de negocio
  models/              Modelos Sequelize (tablas)
  middlewares/         Autenticación JWT y validaciones
  utils/               Utilidades (mapeo de libros)
public/covers/         Portadas de libros servidas en /covers
tests/                 Pruebas unitarias (Jest + supertest)
seed.js                Carga inicial de libros e inventario
swagger.js             Genera swagger_output.json (documentación); lee las rutas desde app.js
```

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Runtime | Node.js (LTS) |
| Framework | Express 5 |
| ORM / BD | Sequelize 6 + PostgreSQL (`pg`) |
| Autenticación | JWT (`jsonwebtoken`), `bcryptjs`, Google OAuth (`google-auth-library`) |
| IA | Google Gemini (`@google/generative-ai`) |
| Pagos | Mercado Pago (`mercadopago`) |
| Correo | `nodemailer` |
| Reportes | `exceljs`, `pdfkit` |
| Documentación | `swagger-autogen` + `swagger-ui-express` |

## Modelo de datos

Tablas: `usuarios`, `roles`, `libros`, `inventory`, `ventas`, `venta_detalles`, `reservas`, `cupones`,
`auditorias`, `historial_accesos`. Roles base: `cliente`, `empleado`, `administrador`.

## Endpoints principales

| Prefijo | Módulo |
|---|---|
| `/api/auth` | Registro, login, verificación 2FA y login con Google/Facebook |
| `/api/libros` | Catálogo de libros |
| `/api/inventario` | Stock |
| `/api/reservas` | Reservas de libros |
| `/api/ventas` | Ventas y pagos |
| `/api/cupones` | Cupones de descuento |
| `/api/dashboard` | Métricas para el panel administrativo |
| `/api/admin/usuario` | Gestión de usuarios/empleados |
| `/api/auditorias` | Registro de auditoría |
| `/api/chat` | Asistente con IA (Gemini) |
| `/api/docs` | Documentación Swagger |

## Requisitos

- Node.js (versión LTS) y npm
- PostgreSQL en ejecución (el proyecto usa la versión 16 en sus contenedores)
- Credenciales de desarrollo para Google OAuth, Gemini y Mercado Pago (**nunca las reales de producción**)

## Puesta en marcha (desarrollo local)

```bash
# 1. Clonar y entrar en la rama de integración
git clone https://github.com/hia-grupo7/hia-g07-backend.git
cd hia-g07-backend
git checkout dev

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env        # y completar los valores (ver tabla)

# 4. (Opcional) cargar libros e inventario de ejemplo
node seed.js

# 5. Levantar el servidor con recarga automática
npm run dev
```

La API queda en `http://localhost:3000` y la documentación en `http://localhost:3000/api/docs`.
Al arrancar, Sequelize sincroniza las tablas (`sync({ alter: true })`) y crea los roles base.

> Contenedores (Docker / Docker Compose): se incorporan en las tarjetas del Sprint 1 y 2 y se documentarán aquí
> cuando se fusionen a `dev`.

## Variables de entorno

Se definen en `.env` (ignorado por Git). La plantilla está en [`.env.example`](.env.example).

| Variable | Descripción |
|---|---|
| `PORT` | Puerto de la API (por defecto `3000`) |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST` | Conexión a PostgreSQL |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Firma y duración de los tokens JWT |
| `GOOGLE_CLIENT_ID` | Login con Google |
| `GEMINI_API_KEY` | Asistente de chat con IA |
| `MERCADOPAGO_ACCESS_TOKEN`, `ACCESS_TOKEN` | Cobros con Mercado Pago |
| `EMAIL_USER`, `EMAIL_PASS` | Cuenta SMTP para envío de correos |

### Secretos (Docker Secrets)

Con Docker Compose, las contraseñas y claves **no** se leen del `.env`: cada una es un archivo de la carpeta
`secrets/` (ignorada por Git) que el contenedor recibe en `/run/secrets/<nombre>`. Así no quedan en el
repositorio ni se ven con `docker inspect`. **Hay que crearlos antes del primer `up`**: si faltan, Docker Compose no falla,
solo avisa y arranca los servicios sin su clave, dejando carpetas vacías con esos nombres en `secrets/` (`init-secrets.js`
las reemplaza por los archivos).

```bash
node scripts/init-secrets.js     # el mismo comando en Windows, Linux y macOS (requiere Node 18+)
```

- **Instalación nueva:** el script genera contraseñas aleatorias.
- **Ya tenés volúmenes creados** (la base se inició con las contraseñas anteriores): agregá `--valores-actuales`.
  Sin ese flag el script se niega a continuar si detecta el volumen
  `rayuela_postgres_data`, porque una contraseña nueva dejaría al backend sin acceso a la base.
- El script **nunca pisa** un archivo existente y toma el valor del `.env` si la variable está definida.
- Las claves de terceros (`gemini_api_key`, `mercadopago_access_token`, `email_pass`) quedan **vacías**: pedir el
  valor real al responsable y pegarlo en el archivo. Mientras estén vacías, el chat con IA, los cobros con Mercado
  Pago y el envío de correos quedan deshabilitados.
- Cambiar un archivo de `secrets/` **no** cambia la contraseña que ya guardó Postgres, Grafana, pgAdmin o MariaDB
  en su volumen; no borres volúmenes para probarlo. Tras recrear el backend, recargá el proxy:
  `docker exec rayuela-nginx-proxy nginx -s reload`.

| Archivo en `secrets/` | Lo usan |
|---|---|
| `db_password` | Postgres, PgBouncer, `postgres_exporter`, backend, backup |
| `replicator_password` | réplica de Postgres |
| `jwt_secret` | backend (firma de tokens) |
| `pgadmin_password`, `grafana_admin_password` | pgAdmin, Grafana |
| `mantis_db_password`, `mantis_db_root_password`, `mantis_crypto_salt` | MantisBT y su base MariaDB |
| `gemini_api_key`, `mercadopago_access_token`, `email_pass` | backend (claves de terceros) |

Sin Docker (`npm run dev`) el backend sigue leyendo esos valores de las variables de entorno del `.env`.

### Rotación de secretos

Cambiar solo el archivo de `secrets/` **no** alcanza: Postgres, Grafana y pgAdmin guardan su contraseña en su volumen
(si solo cambiás el archivo, el backend, PgBouncer y Mantis dejan de conectar). El script `scripts/rotate-secrets.js`
cambia la clave **dentro del servicio**, escribe el archivo nuevo, recrea los contenedores que la usan y verifica que la
nueva funcione y la anterior ya no. Si algo falla, revierte. Es el mismo comando en Windows, Linux y macOS
(requiere Node 18+ y Docker):

```bash
node scripts/rotate-secrets.js --simular --todos          # muestra los pasos sin cambiar nada
node scripts/rotate-secrets.js db_password                # rota uno (pide escribir SI; --si lo omite)
node scripts/rotate-secrets.js --todos --si               # db, réplica, JWT, Grafana y pgAdmin juntos
echo "<clave real>" | node scripts/rotate-secrets.js --poner gemini_api_key --si   # clave de terceros
```

- Rota: `db_password`, `replicator_password`, `jwt_secret`, `grafana_admin_password` y `pgadmin_password`.
  Las claves de terceros (`gemini_api_key`, `mercadopago_access_token`, `email_pass`) se reemplazan con `--poner`.
- **No rota los secretos de Mantis** (`mantis_db_password`, `mantis_db_root_password` y `mantis_crypto_salt`): todavía no está
  implementado ni probado. Cambiar el salt solo cierra las sesiones e invalida los enlaces de RSS y de confirmación
  pendientes; no afecta a los tokens de API ni a los datos.
- Rotar `jwt_secret` cierra todas las sesiones abiertas.
- El valor anterior se guarda en `secrets/.anteriores/` para poder volver atrás (se pierde si se borra `secrets/`).
- Tras rotar, los "valores anteriores" de `init-secrets --valores-actuales` ya no coinciden con tu base: volvé a hacer la copia cifrada.

### Copia de seguridad cifrada de `secrets/`

Las claves de Mantis y las de terceros no se pueden regenerar. Guardá una copia **fuera del repositorio**:

```bash
node scripts/backup-secrets.js respaldar ../respaldo-secretos.enc    # pide una contraseña
node scripts/backup-secrets.js restaurar ../respaldo-secretos.enc    # sin --pisar no toca archivos existentes
```

El archivo `.enc` (AES-256-GCM, no es un .zip) se abre con el mismo script. El script se niega a guardarlo dentro del repo.

## Limitación de solicitudes (rate limiting)

| Ruta | Límite (por IP y por minuto) | Al excederlo |
|---|---|---|
| `POST /api/auth/login` y `POST /api/auth/verificar-2fa` | 5 intentos **fallidos** (los correctos no cuentan) | HTTP 429 con `Retry-After` |
| `POST /api/chat` | 10 solicitudes | HTTP 429 |

Los bloqueos se cuentan en la métrica `rayuela_rate_limit_hits_total{ruta}`. Los valores se cambian con
`RATE_LIMIT_VENTANA_MS`, `RATE_LIMIT_LOGIN_MAX` y `RATE_LIMIT_CHAT_MAX` (ver `.env.example`). Los contadores viven en la memoria
de cada backend: blue y green no los comparten.

**IP del cliente (`TRUST_PROXY_HOPS`).** El limitador cuenta por IP y la IP real llega en `X-Forwarded-For`. La cantidad de
proxies de confianza tiene que coincidir con cómo llegan los pedidos:

- `1` (por defecto): acceso directo a nginx, sin túnel.
- `2`: a través del túnel de Cloudflare (cloudflared + nginx).

Con `1` detrás del túnel el backend ve la IP interna de Docker y todos los visitantes de internet compartirían un solo
contador; con `2` ve la IP pública real y un `X-Forwarded-For` falso se ignora (ambos casos verificados leyendo la IP que
registra la aplicación). Mientras el túnel esté levantado, definir `TRUST_PROXY_HOPS=2` en `.env`, recrear el backend
(`docker compose --profile blue up -d backend-blue`) y recargar nginx (`docker exec rayuela-nginx-proxy nginx -s reload`);
volver a `1` al apagarlo. Con `2` y acceso directo sin túnel, un `X-Forwarded-For` falso podría eludir el límite (deducido
del funcionamiento de Express, no probado).

**Limitaciones.** Limitar por IP implica que cada familia de direcciones tiene su propio contador: un cliente con IPv4 e
IPv6 (doble pila) puede alternar entre las dos y obtener el doble de cupo. Es un freno a la fuerza bruta, no una defensa
completa.

**Túnel de Cloudflare.** `cloudflared` no tiene perfil: `docker compose --profile blue up -d` lo levanta y publica el proxy del
stack, es decir, **todo** `/api/` (incluidos `/api/metrics` y `/api/docs`). Levantalo solo el tiempo necesario y revisá antes
qué rutas quedan públicas.

## Gestión de incidencias (MantisBT)

Mantis corre en el perfil `mantis` del compose, en `http://localhost:8081` (solo desde tu equipo). Sus secretos se crean
con `node scripts/init-secrets.js` (ver arriba), **antes** del primer `up`.

```bash
# Mantis solo
docker compose --profile mantis up -d mantis-db mantis
# Mantis junto con el resto del stack
docker compose --profile blue --profile mantis up -d   # incluye el túnel de Cloudflare (cloudflared no tiene perfil)
```

La primera vez hay que instalar el esquema, cerrar la instalación, crear el proyecto y cargar las incidencias: paso a paso en
[`docs/mantis/README.md`](docs/mantis/README.md). Cada persona levanta un Mantis **vacío**: los datos viven en su volumen local.

## Scripts

| Comando | Acción |
|---|---|
| `npm run dev` | Regenera la documentación Swagger y arranca con `nodemon` |
| `node seed.js` | Carga libros e inventario de ejemplo |
| `npm run lint` | Análisis estático con ESLint (el mismo que corre en el pipeline) |
| `npm test` | Pruebas unitarias (Jest + supertest); no necesitan PostgreSQL |
| `npm run test:coverage` | Igual que `npm test`, con informe de cobertura |

---

## CI/CD

El pipeline vive en `.github/workflows/ci-cd.yml` (GitHub Actions) y se ejecuta en cada Pull Request y en cada push a `dev` y `main`.

| Etapa | Cuándo corre | Qué hace |
|---|---|---|
| Lint (ESLint) | PR y push | `npm ci` y ejecuta `npm run lint`. **Falla** ante errores; los avisos (`warn`) no bloquean. |
| Tests unitarios | PR y push | `npm ci` y ejecuta `npm test` (Jest + supertest, sin base de datos real). |
| Build Docker y Trivy | PR y push | Construye la imagen y la escanea con Trivy. **Falla** ante vulnerabilidades `CRITICAL` o `HIGH` que ya tengan parche. |
| Versión semántica | push a `dev` / `main` | `semantic-release` calcula la versión desde los commits, crea el tag y el release en GitHub con el `CHANGELOG.md` adjunto. |
| Publicación en GHCR | push, si hubo versión nueva | Publica `ghcr.io/hia-grupo7/hia-g07-backend:<versión>` (más `:dev` o `:latest` según la rama). |
| Notificación | siempre | Resumen del estado en la pestaña del run y, si existe el secreto `NOTIFY_WEBHOOK_URL`, aviso por webhook. |

Cada etapa depende de la anterior: si fallan los tests o Trivy, no se versiona ni se publica nada.

**Versionado.** `fix` sube el parche, `feat` sube el minor y `BREAKING CHANGE` (o `!`) sube el major. En `dev` salen prereleases (`v1.1.0-dev.1`) y en `main` versiones estables (`v1.1.0`). Como `dev` y `main` se fusionan con squash o merge commit, **el título del Pull Request debe seguir Conventional Commits** (por ejemplo `feat(CARD-12): agregar filtro por categoría`). Un título sin tipo (`[CARD-12] ...`) no genera versión.

**Secretos.** El pipeline usa solo el `GITHUB_TOKEN` automático. No hay credenciales en el repositorio.

**Probar en tu máquina antes del PR:**

```bash
npm test
docker build -t rayuela-backend .
# Escaneo igual al del pipeline (requiere Docker):
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.76.1 \n  image --severity CRITICAL,HIGH --ignore-unfixed rayuela-backend
```

---

## Guía de contribución

Este repositorio usa un flujo **GitFlow simplificado**. Resumen:

### Ramas

| Rama | Uso |
|---|---|
| `main` | Producción. Protegida. Solo recibe PR desde `dev` al cerrar un sprint (2 aprobaciones, merge commit) |
| `dev` | Integración. Protegida. Recibe PR desde `feature/*` y `fix/*` (1 aprobación, squash) |
| `feature/CARD-XX-descripcion` | Una rama por tarjeta de Trello, creada desde `dev` |
| `fix/descripcion` | Corrección de bugs, creada desde `dev` |

**Nadie hace push directo a `main` ni a `dev`.** Todo entra por Pull Request.

### Flujo de trabajo

```bash
git checkout dev && git pull origin dev
git checkout -b feature/CARD-XX-descripcion-corta
# ... trabajar y commitear ...
git fetch origin && git rebase origin/dev
git push -u origin feature/CARD-XX-descripcion-corta
# abrir el Pull Request hacia dev en GitHub
```

### Commits — Conventional Commits

Formato: `<tipo>(<alcance>): <descripción corta en imperativo>`

Tipos: `feat`, `fix`, `docs`, `chore`, `ci`, `refactor`, `test`, `perf`. Ejemplos:

```
feat(docker): agregar dockerfile multi-stage para el backend
fix(backend): corregir variable solapada en getBookById
perf(postgres): agregar índice compuesto en auditorias
```

El historial de commits alimenta el versionado semántico y el `CHANGELOG.md` automáticos del pipeline.

### Seguridad: lo que nunca se sube

- Archivos `.env` (solo se versiona `.env.example`, sin valores reales), claves `*.pem` / `*.key`.
- Volcados de base de datos (`*.sql`, `*.dump`) y `backups/`. Excepción: scripts versionados dentro de `database/`.
- Tokens de Mercado Pago, claves de Gemini o contraseñas, ni siquiera "temporales".

**Escaneo automático de secretos:** el workflow [`secret-scan.yml`](.github/workflows/secret-scan.yml) ejecuta
[gitleaks](https://github.com/gitleaks/gitleaks) en cada Pull Request (sobre sus commits), en cada push a `dev`/`main`
y una vez por semana sobre todo el historial. Si detecta un secreto, el check falla y el PR no se puede fusionar.
Para probarlo en local (requiere Docker):

```bash
docker run --rm -v "$(pwd):/repo" zricethezav/gitleaks:v8.30.1 git /repo --redact --no-banner
```

Si subís un secreto por error: **revocalo en el proveedor de inmediato** y avisá al Responsable 3 (CI/CD y Seguridad).
Borrar el commit no alcanza: el secreto queda en el historial.

### Antes de abrir un Pull Request

- [ ] La rama está actualizada con `dev` y los commits siguen Conventional Commits.
- [ ] `npm run lint` y `npm test` pasan en local y el título del PR sigue Conventional Commits (define la versión).
- [ ] No hay `.env`, tokens ni credenciales en el diff (`git diff` y `git status`).
- [ ] La tarea cumple los criterios de aceptación de la tarjeta de Trello y se adjuntó evidencia.

---

## Equipo

Grupo 07 — Herramientas e Infraestructura para Aplicaciones (HIA), 2026.
