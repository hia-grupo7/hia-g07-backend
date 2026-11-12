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
index.js               Arranque: middlewares, rutas y sincronización de la BD
config/                Conexión a PostgreSQL (Sequelize) y roles iniciales
src/
  routes/              Definición de endpoints (/api/...)
  controllers/         Entrada/salida HTTP
  services/            Lógica de negocio
  models/              Modelos Sequelize (tablas)
  middlewares/         Autenticación JWT y validaciones
  utils/               Utilidades (mapeo de libros)
public/covers/         Portadas de libros servidas en /covers
seed.js                Carga inicial de libros e inventario
swagger.js             Genera swagger_output.json (documentación)
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

## Scripts

| Comando | Acción |
|---|---|
| `npm run dev` | Regenera la documentación Swagger y arranca con `nodemon` |
| `node seed.js` | Carga libros e inventario de ejemplo |
| `npm test` | Pendiente: aún no hay pruebas automatizadas (se incorporarán con el pipeline CI/CD) |

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
- [ ] No hay `.env`, tokens ni credenciales en el diff (`git diff` y `git status`).
- [ ] La tarea cumple los criterios de aceptación de la tarjeta de Trello y se adjuntó evidencia.

---

## Equipo

Grupo 07 — Herramientas e Infraestructura para Aplicaciones (HIA), 2026.
