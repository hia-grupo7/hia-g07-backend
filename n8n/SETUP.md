# N8N — Guía de Setup y Flujos de Automatización

> **CARD:** N8N-01 (sprint 4)  
> **Rama:** `feature/CARD-17-n8n-flujos-alertas`

---

## Descripción general

Este módulo contiene los flujos de automatización de n8n para el proyecto **Rayuela**. n8n corre como servicio Docker junto al resto del stack y se conecta con Grafana, MantisBT y el servicio de backups.

### Flujos disponibles

| Archivo | Nombre | Trigger | Descripción |
|--------|--------|---------|-------------|
| `00-error-handler.json` | N8N-00 Registro de Errores | Error interno | Workflow de error global que loguea fallos de cualquier otro workflow |
| `01-alertas-infraestructura-mantisbt.json` | N8N-01 Fl.1 — Alertas de Infraestructura | Webhook (POST desde Grafana) | Recibe alertas de Grafana, crea ticket en MantisBT y notifica por email |
| `02-verificacion-backups.json` | N8N-01 Fl.2 — Verificación de Backups | Schedule (04:00 AM diario) | Verifica integridad del backup más reciente de PostgreSQL y notifica por email si falla |
| `03-honeypot-intrusion-mantisbt.json` | SEC-02 Honeypot — Intento de intrusión | Webhook (POST desde el backend, cabecera `X-Honeypot-Token`) | Recibe el aviso del endpoint trampa `/api/admin/reset-all` y crea un incidente de seguridad en MantisBT. Se carga con `python3 n8n/scripts/bootstrap_honeypot.py` |

---

## Requisitos previos

- Docker y Docker Compose instalados
- Puerto **5678** disponible en el host (n8n UI)
- Variables de entorno correctamente configuradas en `.env`
- Cuenta de Gmail con **contraseña de aplicación** habilitada (para SMTP)
- MantisBT corriendo con un **token API** generado

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
```

> **Cómo generar la `N8N_ENCRYPTION_KEY`:**
> ```bash
> openssl rand -hex 32
> ```

> **Cómo generar una contraseña de aplicación de Gmail:**  
> Google Account → Seguridad → Verificación en 2 pasos → Contraseñas de aplicaciones

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

---

## 3. Bootstrap automático de flujos y credenciales

Una vez que el stack está levantado y `n8n` está **healthy**, ejecutá el script de bootstrap que importa los workflows y configura todas las credenciales automáticamente:

```bash
python3 n8n/scripts/bootstrap_fl1.py
```

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

1. **Importa los 3 workflows** (00, 01, 02) a n8n
2. **Crea/actualiza credenciales** en n8n:
   - `Grafana Webhook Basic Auth` — Basic Auth del webhook del Fl.1
   - `MantisBT API Token` — Header Auth para crear tickets
   - `SMTP Gmail Rayuela` — Credencial SMTP para emails del Fl.2
3. **Configura Grafana** (contact point n8n + política de alertas)
4. Es **idempotente**: podés ejecutarlo varias veces sin problema

> **Prerequisito del bootstrap:** n8n debe tener el usuario owner ya creado. Si es la primera vez que levantás n8n, entrá a `http://127.0.0.1:5678`, completá el wizard de bienvenida y luego ejecutá el bootstrap.

---

## 4. Verificar que los flujos están activos

1. Abrí `http://127.0.0.1:5678` en el navegador
2. Iniciá sesión con `N8N_BASIC_AUTH_USER` / `N8N_BASIC_AUTH_PASSWORD`
3. En la lista de workflows verificá que los 3 tengan el toggle en **verde (activo)**:
   - `N8N-00 - Registro de Errores`
   - `N8N-01 Fl.1 - Alertas de Infraestructura (Grafana → MantisBT → Notificacion)`
   - `N8N-01 Fl.2 - Verificacion de Backups (Schedule → Check → Notificar)`

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
    └── 02-verificacion-backups.json      ← Fl.2: Verificación de backups diaria
```
