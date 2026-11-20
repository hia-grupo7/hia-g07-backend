# N8N — Guía de Setup y Flujos de Automatización

> **CARD:** N8N-02 (sprint 4)  
> **Rama:** `feature/CARD-18-n8n-informe-ejecutivo-gemini`

---

## Descripción general

Este módulo contiene los flujos de automatización de n8n para el proyecto **Rayuela**. n8n corre como servicio Docker junto al resto del stack y se conecta con Grafana, MantisBT y el servicio de backups.

### Flujos disponibles

| Archivo | Nombre | Trigger | Descripción |
|--------|--------|---------|-------------|
| `00-error-handler.json` | N8N-00 Registro de Errores | Error interno | Workflow de error global que loguea fallos de cualquier otro workflow |
| `01-alertas-infraestructura-mantisbt.json` | N8N-01 Fl.1 — Alertas de Infraestructura | Webhook (POST desde Grafana) | Recibe alertas de Grafana, crea ticket en MantisBT y notifica por email |
| `02-verificacion-backups.json` | N8N-01 Fl.2 — Verificación de Backups | Schedule (04:00 AM diario) | Verifica integridad del backup más reciente de PostgreSQL y notifica por email si falla |
| `03-informe-ejecutivo-gemini.json` | N8N-02 Fl.3 — Informe Ejecutivo Asistido por IA (Gemini 3.8 Flash) | Schedule (lunes 09:00) | Genera informe ejecutivo semanal con métricas del backend + análisis Gemini → guarda en Nextcloud (`/Informes_Ejecutivos`) y notifica por email |
| `03-honeypot-intrusion-mantisbt.json` | SEC-02 Honeypot — Intento de intrusión | Webhook (POST desde el backend, cabecera `X-Honeypot-Token`) | Recibe el aviso del endpoint trampa `/api/admin/reset-all` y crea un incidente de seguridad en MantisBT. Se carga con `python3 n8n/scripts/bootstrap_honeypot.py` |

---

## Requisitos previos

- Docker y Docker Compose instalados
- Puerto **5678** disponible en el host (n8n UI)
- Variables de entorno correctamente configuradas en `.env`
- Cuenta de Gmail con **contraseña de aplicación** habilitada (para SMTP)
- MantisBT corriendo con un **token API** generado
- **Nextcloud** corriendo (`nextcloud/compose.nextcloud.yaml`) con la carpeta `Informes_Ejecutivos` creada (Fl.3)
- **API key de Gemini** válida (Fl.3)

---

## 1. Configurar variables de entorno

Copiá el archivo de ejemplo y completá los valores reales:

```bash
cp .env.example .env
```

Luego editá `.env` y completá **todas** las variables relacionadas con n8n:

```dotenv
# Acceso a la UI de n8n
N8N_PORT=5678
N8N_URL=http://127.0.0.1:5678
N8N_BASIC_AUTH_USER=tu_usuario@gmail.com
N8N_BASIC_AUTH_PASSWORD=una_password_segura

# Clave de cifrado para credenciales guardadas en n8n (obligatoria, generarla una sola vez)
N8N_ENCRYPTION_KEY=genera_una_cadena_aleatoria_larga_y_segura

# Webhook Grafana → n8n (Basic Auth del contact point de Grafana)
N8N_WEBHOOK_BASIC_AUTH_USER=grafana-webhook
N8N_WEBHOOK_BASIC_AUTH_PASSWORD=cambia_esta_credencial

# URL interna Docker que usa Grafana para llegar a n8n
N8N_INTERNAL_WEBHOOK_URL=http://n8n:5678/webhook/grafana-alerta

# Grafana (para el bootstrap)
GRAFANA_URL=http://127.0.0.1:3001
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=tu_password_grafana

# SMTP (Gmail con contraseña de aplicación)
N8N_SMTP_USER=tu_correo@gmail.com
N8N_SMTP_PASSWORD=xxxx_xxxx_xxxx_xxxx   # Contraseña de aplicación, NO tu password de Gmail
N8N_SMTP_HOST=smtp.gmail.com
N8N_SMTP_PORT=465
N8N_SMTP_SECURE=true
N8N_ALERT_EMAIL_FROM=tu_correo@gmail.com
N8N_ALERT_EMAIL_TO=destinatario@gmail.com

# MantisBT
MANTIS_API_TOKEN=tu_token_api_mantis
MANTIS_PROJECT_ID=1
MANTIS_CATEGORY_ID=1

# Fl.3 — Informe ejecutivo (Gemini + Nextcloud)
GEMINI_API_KEY=tu_api_key_de_gemini
N8N_NEXTCLOUD_USER=admin
N8N_NEXTCLOUD_PASSWORD=tu_password_de_aplicacion_nextcloud
# Solo documentales: la URL y la carpeta están fijas en el workflow
N8N_NEXTCLOUD_URL=http://nextcloud:80
N8N_NEXTCLOUD_FOLDER=Informes_Ejecutivos
```

> **Cómo generar la `N8N_ENCRYPTION_KEY`:**
> ```bash
> openssl rand -hex 32
> ```

> **Cómo generar una contraseña de aplicación de Gmail:**  
> Google Account → Seguridad → Verificación en 2 pasos → Contraseñas de aplicaciones

> **Contraseña de aplicación de Nextcloud (Fl.3):**  
> Nextcloud → Configuración personal → Seguridad → Contraseñas de aplicación. Usala en `N8N_NEXTCLOUD_PASSWORD`.

---

## 2. Levantar el stack

### Stack completo (incluye n8n, Grafana, MantisBT, backups, etc.)

```bash
docker compose --profile mantis up -d
```

### Solo n8n y sus dependencias (mínimo para probar flujos)

```bash
docker compose up -d postgres-primary n8n
```

### Verificar que n8n esté sano

```bash
docker compose ps n8n
# El estado debe ser "healthy"

# También podés ver los logs en tiempo real:
docker compose logs -f n8n
```

### Stack de Nextcloud (necesario para Fl.3)

El Fl.3 guarda el informe por WebDAV en el contenedor `nextcloud`, por lo que el stack de Nextcloud debe estar corriendo y compartir la red `integracion-net` con n8n:

```bash
# --env-file debe ir ANTES de -f para tomar NC_DB_NAME / NC_DB_USER / NC_ADMIN_USER / NC_PORT del .env (si no están, se usan los valores por defecto)
docker compose --env-file .env -f nextcloud/compose.nextcloud.yaml up -d
docker compose --env-file .env -f nextcloud/compose.nextcloud.yaml ps
```

> Las contraseñas de Nextcloud (`secrets/nc_db_password` y `secrets/nc_admin_password`) las crea `node scripts/init-secrets.js`. Nextcloud queda en `http://localhost:8082` (variable `NC_PORT`; el 8081 es de Mantis).
>
> La red `integracion-net` la crea el stack principal (`compose.yaml`) y n8n se une a ella; el compose de Nextcloud la declara `external: true`. Por eso el stack principal puede levantarse solo, pero Nextcloud necesita la red: levantá primero el stack principal, o creala a mano con `docker network create integracion-net`.

---

## 3. Bootstrap automático de flujos y credenciales

Una vez que el stack está levantado y `n8n` está **healthy**, ejecutá el script de bootstrap que importa los workflows y configura todas las credenciales automáticamente:

```bash
python3 n8n/scripts/bootstrap_fl1.py
```

Además del bootstrap de Fl.1 y Fl.2, el script también importa y activa el workflow del **Flujo 3** (`03-informe-ejecutivo-gemini.json`) y configura las credenciales `Gemini API Key` y `Nextcloud WebDAV`.

### Opciones del bootstrap

```bash
# Saltear la configuración del contact point en Grafana (si Grafana no está disponible)
python3 n8n/scripts/bootstrap_fl1.py --skip-grafana

# Saltear la configuración de SMTP (si no tenés credenciales de email aún)
python3 n8n/scripts/bootstrap_fl1.py --skip-smtp

# Usar un archivo .env alternativo
python3 n8n/scripts/bootstrap_fl1.py --env-file /ruta/a/tu/.env
```

### Qué hace el bootstrap

1. **Importa los 4 workflows** (00, 01, 02, 03) a n8n
2. **Crea/actualiza credenciales** en n8n:
   - `Grafana Webhook Basic Auth` — Basic Auth del webhook del Fl.1
   - `MantisBT API Token` — Header Auth para crear tickets
   - `SMTP Gmail Rayuela` — Credencial SMTP para emails (Fl.1, Fl.2 y Fl.3)
   - `Gemini API Key` — Header Auth (`x-goog-api-key`) para el Fl.3
   - `Nextcloud WebDAV` — Basic Auth para guardar el informe del Fl.3
3. **Configura Grafana** (contact point n8n + política de alertas)
4. Es **idempotente**: podés ejecutarlo varias veces sin problema (los workflows se actualizan **por nombre**)

> **Prerequisito del bootstrap:** n8n debe tener el usuario owner ya creado. Si es la primera vez que levantás n8n, entrá a `http://127.0.0.1:5678`, completá el wizard de bienvenida y luego ejecutá el bootstrap.

### Reproducción de Fl.3 (Nextcloud + Gemini)

El bootstrap crea/actualiza el Fl.3 igual que Fl.1 y Fl.2, pero **no** prepara Nextcloud. Pasos completos desde cero:

1. **Completar `.env`**: `GEMINI_API_KEY`, `N8N_NEXTCLOUD_USER`/`N8N_NEXTCLOUD_PASSWORD` y SMTP (`N8N_SMTP_*` o `EMAIL_*`). Si falta la API key o la password de Nextcloud, el bootstrap solo avisa y **no** crea esas credenciales (reusa la existente por nombre, si existe).
2. **Levantar Nextcloud** (ver sección 2) y verificar que comparta `integracion-net` con n8n:
   ```bash
   docker network inspect integracion-net --format '{{range .Containers}}{{.Name}} {{end}}'
   # Deben aparecer nextcloud y rayuela-n8n
   ```
3. **Confiar en el host `nextcloud`**:
   - Instalación nueva: ya viene en `nextcloud/compose.nextcloud.yaml` (`NEXTCLOUD_TRUSTED_DOMAINS: localhost nextcloud`).
   - Instalación existente (ese env var solo aplica en la instalación inicial):
     ```bash
     docker compose --env-file .env -f nextcloud/compose.nextcloud.yaml \
       exec -u www-data nextcloud php occ config:system:set trusted_domains 1 --value=nextcloud
     ```
4. **Crear la carpeta** `Informes_Ejecutivos` en Nextcloud (UI o WebDAV `MKCOL`). Un PUT a una carpeta inexistente devuelve `409 Conflict`.
5. **Ejecutar el bootstrap** (lee el `.env` de la raíz del repo):
   ```bash
   python3 n8n/scripts/bootstrap_fl1.py
   ```
6. **Probar**: ejecutar el workflow desde la UI y verificar que aparezca `informe-YYYY-MM-DD.md` en `/Informes_Ejecutivos`.

> **Modelo Gemini:** el workflow usa `gemini-3.8-flash` (fijado en el JSON). `gemini-2.5-flash` ya no está disponible para cuentas nuevas y la API responde `404`.

---

## 4. Verificar que los flujos están activos

1. Abrí `http://127.0.0.1:5678` en el navegador
2. Iniciá sesión con `N8N_BASIC_AUTH_USER` / `N8N_BASIC_AUTH_PASSWORD`
3. En la lista de workflows verificá que los 4 tengan el toggle en **verde (activo)**:
   - `N8N-00 - Registro de Errores`
   - `N8N-01 Fl.1 - Alertas de Infraestructura (Grafana → MantisBT → Notificacion)`
   - `N8N-01 Fl.2 - Verificacion de Backups (Schedule → Check → Notificar)`
   - `N8N-02 Fl.3 - Informe Ejecutivo Asistido por IA (Gemini ...)`

Si alguno no está activo, hacé click en el toggle para activarlo.

---

## 5. Descripción de cada flujo

### Fl.0 — Registro de Errores (`00-error-handler.json`)

**Rol:** Workflow global de captura de errores.  
**Trigger:** `Error Trigger` (n8n lo llama automáticamente cuando otro workflow falla).  
**Acción:** Loguea el error completo (workflow, nodo, mensaje, stack) en `console.error` para que sea visible en `docker compose logs n8n`.

Los workflows Fl.1 y Fl.2 están configurados con `errorWorkflow: "ncCuil3GfmQzaetM"` para delegar errores a este flujo.

---

### Fl.1 — Alertas de Infraestructura (`01-alertas-infraestructura-mantisbt.json`)

**Trigger:** Webhook POST autenticado en `/webhook/grafana-alerta`  
**Flujo:**

```
Grafana alerta  →  Webhook (Basic Auth)  →  Enriquecer Alerta
                                              ├─ OK: Crear Ticket MantisBT  →  Registrar Ticket  →  Notificar Incidente (email)
                                              └─ Error: Registrar Error
```

**Deduplicación:** Usa `staticData` global con TTL de 6 horas para evitar crear tickets duplicados por la misma alerta.

**Mapeo de severidad Grafana → MantisBT:**

| Grafana severity | MantisBT Priority | MantisBT Severity |
|-----------------|-------------------|-------------------|
| critical / high | 50 (urgent)       | 70 (crash)        |
| warning / medium | 40 (high)        | 60 (major)        |
| info            | 30 (normal)       | 50 (minor)        |
| low             | 20 (low)          | 50 (minor)        |

---

### Fl.2 — Verificación de Backups (`02-verificacion-backups.json`)

**Trigger:** Schedule diario a las **04:00 AM** (zona horaria: `America/Argentina/Jujuy`)  
**Flujo:**

```
Schedule (04:00)  →  Validar Backup (Code)  →  Registrar Resultado
                                                   ├─ FALLO: Notificar Fallo Backup (email)
                                                   └─ OK: (fin silencioso)
```

**Qué valida:**

| Chequeo | Criterio |
|---------|---------|
| Existencia | Al menos un archivo `rayuela_*.sql.gz` en `/backups` |
| Frescura | Modificado hace menos de 4 horas |
| Integridad gzip | Archivo descomprimible sin errores |
| Completitud del dump | Contiene el marcador `PostgreSQL database dump complete` |

**Motivos de fallo posibles:** `SIN_BACKUPS`, `BACKUP_VIEJO`, `ARCHIVO_VACIO`, `GZIP_INVALIDO`, `DUMP_VACIO`, `DUMP_INCOMPLETO`, `ERROR_VALIDACION`

> El volumen `backups_data` es compartido entre el servicio `backup` (escritura) y `n8n` (solo lectura, montado como `:ro`).

### Fl.3 — Informe Ejecutivo Asistido por IA (`03-informe-ejecutivo-gemini.json`)

**Trigger:** Schedule semanal (lunes 09:00, timezone `America/Argentina/Jujuy`).

**Flujo:**

```
Schedule (Lun 09:00)  →  Obtener Metricas (backend /api/dashboard + /api/metrics)
                                        →  Consolidar Metricas  →  Generar Informe (Gemini 3.8 Flash)
                                        →  Parsear Informe  →  Guardar Informe (Nextcloud WebDAV)
                                                                                →  Enviar Informe (email)
```

**Qué hace:**
1. Consulta métricas al backend (`/api/dashboard/metricas-cards`, `/api/dashboard/ventas-mensuales`, `/api/dashboard/top-libros`) y a `/api/metrics` (errores de pagos).
2. Arma el payload de métricas y construye el prompt para Gemini 3.8 Flash (2.5 Flash fue discontinuado para cuentas nuevas).
3. Gemini genera el informe ejecutivo en Markdown.
4. n8n guarda el informe en Nextcloud (`/remote.php/dav/files/<user>/Informes_Ejecutivos/informe-YYYY-MM-DD.md`).
5. Envía el informe por email (SMTP Gmail Rayuela).

**Gestión de errores:** ramas de error hacia el workflow `N8N-00 - Registro de Errores` (`ncCuil3GfmQzaetM`).

> Los nodos usan salida de error (`onError: continueErrorOutput`): una falla se enruta a `Registrar Error` y la ejecución puede quedar en `success`. Ver troubleshooting.

---

## 6. Actualizar el proyecto (pull de la rama)

Cuando haya cambios en la rama y necesites actualizarlos:

```bash
# 1. Traer los cambios remotos
git fetch origin
git pull

# 2. Reiniciar solo n8n para aplicar cambios de configuración (si cambiaron variables)
docker compose up -d --no-deps n8n

# 3. Si cambiaron los workflows en n8n/workflows/, volver a ejecutar el bootstrap
python3 n8n/scripts/bootstrap_fl1.py

# 4. Verificar que todo esté healthy
docker compose ps
```

> Si cambiaron variables en `.env.example`, actualizalas también en tu `.env` local antes de reiniciar.

---

## 7. Troubleshooting frecuente

### n8n no arranca o queda en "starting"

```bash
docker compose logs n8n --tail 50
```

Causas comunes:
- `N8N_ENCRYPTION_KEY` vacía o diferente a la usada anteriormente (rompería las credenciales guardadas)
- Puerto 5678 ocupado por otro proceso

### El bootstrap falla con "usuario no creado"

n8n requiere completar el wizard inicial antes de aceptar llamadas a la API. Accedé a `http://127.0.0.1:5678` y completá el registro de owner, luego ejecutá el bootstrap de nuevo.

### Los emails no llegan

- Verificá que `N8N_SMTP_PASSWORD` sea una **contraseña de aplicación** de Google, no tu contraseña normal
- Verificá en la UI de n8n que la credencial `SMTP Gmail Rayuela` esté guardada correctamente
- Revisá los logs: `docker compose logs n8n | grep -i smtp`

### n8n no resuelve el host `nextcloud` (`getaddrinfo ENOTFOUND`)

- n8n y Nextcloud deben estar en `integracion-net`. Verificá que exista (`docker network ls`), levantá el stack de Nextcloud y luego recreá n8n:
  `docker compose up -d n8n`
- Verificá: `docker network inspect integracion-net --format '{{range .Containers}}{{.Name}} {{end}}'`

### El Fl.3 termina "success" pero no guarda el informe en Nextcloud

- Verificá que `trusted_domains` incluya `nextcloud` (sección 3, paso 3). Sin eso Nextcloud responde `400`.
- Verificá que exista la carpeta `Informes_Ejecutivos` (PUT a carpeta inexistente = `409`).
- Como los nodos usan `onError: continueErrorOutput`, el fallo puede quedar oculto: revisá el nodo `Registrar Error` en la ejecución y en `docker compose logs n8n`.

### Gemini responde 404 / 400 en el Fl.3

- `404 ... model ... no longer available` → el modelo cambió; usá `gemini-3.8-flash` (ya configurado en el JSON).
- `400/403` → `GEMINI_API_KEY` inválida o sin permisos; regenerala y volvé a correr el bootstrap.

### El email del Fl.3 llega sin el informe

El nodo `Guardar Informe` (PUT WebDAV) devuelve body vacío, por eso el email debe leer el informe desde `Parsear Informe` con `{{ $('Parsear Informe').first().json.informe }}` y no desde `$json`.

### El Fl.1 no recibe alertas de Grafana

- Verificá que el contact point en Grafana apunte a `http://n8n:5678/webhook/grafana-alerta`
- Verificá que las credenciales de Basic Auth coincidan con `N8N_WEBHOOK_BASIC_AUTH_USER` / `N8N_WEBHOOK_BASIC_AUTH_PASSWORD`
- El workflow Fl.1 debe estar **activo** en la UI de n8n

### El Fl.2 no detecta backups

- Verificá que el volumen `backups_data` esté montado en ambos contenedores: `backup` y `n8n`
- Verificá que el servicio `backup` esté corriendo: `docker compose ps backup`
- El Fl.2 busca archivos con el patrón `rayuela_*.sql.gz` en `/backups`

---

## 8. Estructura de la carpeta n8n

```
n8n/
├── SETUP.md                              ← Este archivo
├── scripts/
│   └── bootstrap_fl1.py                  ← Script de bootstrap (idempotente)
└── workflows/
    ├── 00-error-handler.json             ← Fl.0: Error handler global
    ├── 01-alertas-infraestructura-mantisbt.json  ← Fl.1: Alertas → MantisBT
    ├── 02-verificacion-backups.json      ← Fl.2: Verificación de backups diaria
    └── 03-informe-ejecutivo-gemini.json  ← Fl.3: Informe ejecutivo con Gemini
```
