# Diagnóstico de fallas con IA (n8n + Qdrant + Gemini)

Cuando algo se cae, el sistema avisa por correo a la persona de guardia **con el estado del sistema y una solución
sugerida por IA** que sale del manual operativo del proyecto (`docs/manual-operativo/`).

```
 IA-03 Monitor de salud (cada 30 s)         IA-02 Diagnóstico con IA (webhook)
 ┌─────────────────────────────┐            ┌────────────────────────────────────────────────┐
 │ Patroni :8008, etcd, HAProxy│  evento    │ valida y oculta secretos → agente Gemini       │
 │ y /api/health del backend   ├───────────▶│   ├─ consulta el manual en Qdrant (RAG)         │──▶ correo
 └─────────────────────────────┘ (token)    │   └─ si falla la IA: correo "sin IA" + 1º pasos │
        │ si IA-02 no responde: aviso directo └────────────────────────────────────────────────┘
        ▼
      correo
 IA-01 Carga del manual en Qdrant (manual: se ejecuta a mano al cambiar el manual)
```

| Flujo | Disparador | Qué hace |
|---|---|---|
| **IA-01 Carga del manual en Qdrant** | Manual (botón "Execute workflow") | Lee los `.md` de `docs/manual-operativo/`, los parte por escenario (63 fragmentos), calcula los vectores con Gemini y los guarda en Qdrant (colección `rayuela_manual`). Es idempotente: borra la colección antes de cargar |
| **IA-02 Diagnóstico de fallas con IA (RAG)** | Webhook `POST /webhook/diagnostico-falla` con cabecera `X-Diagnostico-Token` | Valida y limpia el evento (oculta contraseñas, tokens y claves antes de enviarlo a la IA), el agente consulta el manual y arma el correo. Si la IA falla, manda el correo "sin IA" con los primeros pasos del manual. Los eventos de recuperación no usan IA |
| **IA-03 Monitor de salud de la plataforma** | Cada 30 segundos | Revisa los dos nodos de Patroni, los tres etcd, HAProxy y `/api/health`. Solo avisa si algo cambia (falla nueva, cambio de líder, recuperación) y repite el aviso cada 15 minutos si la falla persiste |

Códigos de evento que genera el monitor: `NODO_DB_CAIDO`, `LIDER_CAMBIO`, `SIN_LIDER`, `SIN_REPLICA`, `ETCD_DEGRADADO`,
`ETCD_SIN_QUORUM`, `HAPROXY_SIN_PRIMARIO`, `HAPROXY_CAIDO`, `BACKEND_CAIDO`, `BACKEND_SIN_BASE_DE_DATOS` y
`PLATAFORMA_RECUPERADA` (explicados en el manual, `00-arquitectura-y-comandos.md`).

Seguridad: el webhook exige token; Qdrant exige clave y no se publica al equipo; los secretos se ocultan antes de llegar a
Gemini; el agente **solo sugiere** (no ejecuta nada) y todo paso que interrumpa el servicio lleva la advertencia
"Requiere aprobación humana antes de ejecutarse".

## Dónde poner tus claves

| Qué | Dónde | Detalle |
|---|---|---|
| **Clave de Gemini** | `secrets/gemini_api_key` (una sola línea, sin espacios ni saltos extra) **o** en n8n | Se obtiene en Google AI Studio. Es la misma que usa el chat del backend. Opción en n8n: Credentials > *Google Gemini(PaLM) Api* con el nombre exacto **`Gemini Rayuela`** y la clave |
| **Correo que envía** (SMTP) | `.env`: `N8N_SMTP_USER` (tu Gmail) y `N8N_SMTP_PASSWORD` (**contraseña de aplicación** de Google, no tu clave normal) **o** en n8n | Opción en n8n: Credentials > *SMTP* con el nombre exacto **`SMTP Gmail Rayuela`** (host `smtp.gmail.com`, puerto `465`, SSL activado, tu usuario y la contraseña de aplicación). Se genera en Cuenta de Google > Seguridad > Verificación en 2 pasos > Contraseñas de aplicaciones |
| **Correo que recibe** (tu correo institucional) | `.env`: `N8N_ALERT_EMAIL_TO` | Si no lo definís, editá la constante `DESTINATARIO` en dos nodos "Code": **`Validar y sanear`** (IA-02) y **`Revisar plataforma`** (IA-03). Es el único lugar donde está el destinatario |
| **Remitente** | `.env`: `N8N_ALERT_EMAIL_FROM` (si falta se usa `N8N_SMTP_USER`) | Con Gmail debe ser la misma cuenta del SMTP |
| **Tu usuario de n8n** (solo para el script) | `.env`: `N8N_LOGIN_EMAIL` y `N8N_LOGIN_PASSWORD` | Es el que creaste al abrir n8n la primera vez (`http://127.0.0.1:5678`) |

Las claves de Qdrant (`secrets/qdrant_api_key`) y del webhook (`secrets/diagnostico_webhook_token`) ya se generaron solas
con `node scripts/init-secrets.js`: no hay que tocarlas. **Nunca subas `.env` ni `secrets/` al repositorio** (ya están
ignorados).

## Puesta en marcha

### Opción A — con el script (recomendada)

```bash
docker compose --profile blue up -d qdrant n8n        # n8n monta el manual en /manual
# 1) poner las claves de la tabla de arriba
python3 n8n/scripts/bootstrap_ia.py                   # crea/reutiliza credenciales, importa los 3 flujos y activa IA-02 e IA-03
# 2) en n8n (http://127.0.0.1:5678) abrir "IA-01 Carga del manual en Qdrant" y presionar "Execute workflow"
```

El script crea o reutiliza las credenciales por su nombre exacto, asigna cada una a su nodo, carga el destinatario y
activa IA-02 e IA-03 (solo si hay credencial SMTP; con `--sin-activar-monitor` queda inactivo). Si falta la clave de Gemini
lo avisa y deja esos nodos sin credencial. Es idempotente: se puede repetir.

### Opción B — a mano, desde la interfaz de n8n

1. *Credentials > Create*: `Gemini Rayuela` (Google Gemini PaLM), `SMTP Gmail Rayuela` (SMTP), `Qdrant Rayuela`
   (Qdrant API: URL `http://qdrant:6333` y la clave de `secrets/qdrant_api_key`), `Qdrant API Key Header`
   (Header Auth: nombre `api-key`, valor la misma clave) y `Diagnostico Webhook Token` (Header Auth: nombre
   `X-Diagnostico-Token`, valor el contenido de `secrets/diagnostico_webhook_token`).
2. *Workflows > Import from file*: `n8n/workflows/10-ia-carga-manual-qdrant.json`, `11-ia-diagnostico-fallas-rag.json` y
   `12-ia-monitor-salud-plataforma.json`.
3. En cada flujo, abrir los nodos con triángulo rojo y elegir la credencial. Cambiar `DESTINATARIO` y `REMITENTE` en los
   dos nodos "Code" indicados.
4. Ejecutar IA-01 una vez y activar IA-02 e IA-03 (interruptor *Active*).

## Probar

```bash
# 1) Que el manual esté en Qdrant (tras ejecutar IA-01: debe mostrar 63 puntos)
docker run --rm --network rayuela-network curlimages/curl:latest -s -H "api-key: $(cat secrets/qdrant_api_key)" http://qdrant:6333/collections/rayuela_manual

# 2) Falla de ejemplo directo al diagnóstico (llega un correo con diagnóstico)
docker run --rm --network rayuela-network curlimages/curl:latest -s -X POST http://n8n:5678/webhook/diagnostico-falla \
  -H "Content-Type: application/json" -H "X-Diagnostico-Token: $(cat secrets/diagnostico_webhook_token)" \
  -d '{"servicio":"base-de-datos","evento":"NODO_DB_CAIDO","severidad":"critica","descripcion":"El nodo patroni1 no responde","estado":{"lider":"patroni2"}}'

# 3) Falla real: cae el líder de la base y el monitor avisa solo (en menos de ~45 s)
docker kill rayuela-patroni1      # (o el que sea líder: docker exec rayuela-patroni1 patronictl list)
docker start rayuela-patroni1     # al volver llega el correo de recuperación
```

Sin token o con uno incorrecto el webhook responde 403.

## Qué se probó y qué no

Se probó en un n8n descartable (misma versión, 2.48.6) con un servidor SMTP de captura y **un servidor que imita a Gemini**:

- IA-01: lee el manual y lo parte en 63 fragmentos; el borrado de la colección con la clave real de Qdrant responde bien; con
  embeddings simulados los 63 fragmentos se insertaron en Qdrant a través del nodo real de n8n.
- IA-02: el webhook rechaza (403) sin token o con token incorrecto; el agente consulta la herramienta de Qdrant y se arma el correo
  (con bloques de código, estado y aviso de que es una sugerencia de IA); los secretos de ejemplo (clave en una URL de Postgres,
  `Bearer`, `password=`, claves de API y JWT) se ocultan antes de llegar al agente; con la IA caída llega el correo "(sin IA)";
  el evento de recuperación genera su correo.
- IA-03: contra el clúster real, silencio mientras todo está sano; al caer el líder (`docker kill`) avisó a los 14 s, volvió a
  avisar al elegirse el nuevo líder (`LIDER_CAMBIO`) y mandó el correo de recuperación al levantar el nodo.

**No se probó con Gemini real**: la calidad de los diagnósticos y la recuperación semántica del manual con embeddings reales
dependen de tu clave y del modelo. Tampoco se probó el envío por Gmail real ni `bootstrap_ia.py` contra tu n8n (no hay
usuario de n8n en `.env`); sí se probó la asignación de credenciales a los nodos. Primera prueba recomendada: ejecutar IA-01, enviar el
ejemplo 2 y revisar que el correo cite las secciones correctas del manual (`DB-01`, `DB-02`, ...).

Ajustes posibles: el modelo del agente (`models/gemini-3.8-flash`) se cambia en el nodo *Google Gemini Chat Model* si tu clave
no lo tiene; si se cambia el modelo de embeddings hay que volver a ejecutar IA-01 (la colección se recrea con el tamaño nuevo).
