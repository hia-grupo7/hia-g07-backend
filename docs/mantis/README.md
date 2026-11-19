# MantisBT — Gestión de incidencias (CARD-19 / MAN-01)

MantisBT 2.28.4 con MariaDB 10.11, desplegado con Docker Compose en el perfil `mantis`. Sirve para registrar y
seguir las incidencias del proyecto (bugs técnicos, rendimiento de la base, seguridad e infraestructura) con su
ciclo de vida completo: `Nueva` → `Asignada` → `Resuelta` → `Cerrada`.

## Qué incluye

| Componente | Detalle |
|---|---|
| Imagen | `xlrl/mantisbt:2.28.4`, fijada por versión y por digest (no se actualiza sola). Es una imagen de la comunidad: MantisBT no tiene imagen oficial. Ver [Por qué esta imagen](#por-qué-esta-imagen). |
| Base de datos | `mantis-db` (MariaDB 10.11) con volumen `rayuela_mantis_db_data`. |
| Configuración | `mantis/config_inc.php`, montado dentro del contenedor (la imagen no trae uno): lee los valores sensibles de Docker Secrets (`/run/secrets`); no contiene secretos. |
| Acceso | `http://localhost:8081`, solo desde el propio equipo (`127.0.0.1`). |
| Red | `rayuela-network`, para que n8n (N8N-01) pueda llamar a la API de Mantis. |

## Puesta en marcha

Los comandos son los mismos en Windows, Linux y macOS y se ejecutan desde la carpeta raíz del backend. Hay dos formas de
levantar Mantis; la instalación inicial (más abajo) es igual en las dos.

### 0. Una sola vez: crear los secretos

`node scripts/init-secrets.js` (ver "Secretos" en el README principal) genera en `secrets/` `mantis_db_password`,
`mantis_db_root_password` y `mantis_crypto_salt`. **Hay que crearlos antes del primer `up`**: si faltan, Compose no falla,
arranca los servicios sin su clave y deja carpetas vacías (el script las reemplaza). Si ya tenés un volumen de Mantis, el
script se niega a inventar claves nuevas (dejarían la base inaccesible): usá una copia cifrada
(`scripts/backup-secrets.js`) o `--valores-actuales --env <archivo>`.

### Caso A: Mantis solo (sin el resto del stack)

```bash
docker compose --profile mantis up -d mantis-db mantis
```

Solo necesita sus tres archivos de `secrets/`: Compose no exige los secretos de los servicios que no se levantan. Mantis
queda en `http://localhost:8081` y crea la red `rayuela-network`.

### Caso B: Mantis junto con el resto del stack

```bash
docker compose --profile blue --profile mantis up -d
```

Ese comando levanta también el túnel de Cloudflare (`cloudflared`), que no tiene perfil y publica solo el proxy del stack
(CARD-15), no Mantis: Mantis escucha únicamente en `127.0.0.1`.

Si el stack ya está levantado, alcanza con sumar Mantis sin tocar los demás contenedores:
`docker compose --profile mantis up -d mantis-db mantis`. Todos comparten `rayuela-network` (n8n podrá llamar a la API de
Mantis). Para el backend hace falta la imagen local: `docker build -t rayuela-backend:1.1.0 .`.

Si el puerto 8081 está ocupado (por ejemplo, por Nextcloud), definir `MANTIS_PORT=8082` en `.env` y, para el script de carga,
`MANTIS_URL=http://localhost:8082`.

### Instalación inicial (solo la primera vez, igual en los dos casos)

1. **Habilitar el instalador.** Por seguridad la imagen mantiene oculta la carpeta `admin/`. Definir
   `MANTIS_ENABLE_ADMIN=1` en `.env` y recrear Mantis: `docker compose --profile mantis up -d mantis`.
2. **Instalar el esquema.** Abrir `http://localhost:8081/admin/install.php`. Los datos de conexión vienen cargados (host
   `mantis-db`, usuario `mantis`, base `bugtracker`) y la contraseña de la base aparece como `______`: **no hace falta
   escribirla**, Mantis usa la del secreto. En "Admin Username/Password" escribir el usuario `mantis` y el contenido de
   `secrets/mantis_db_password`. Pulsar *Install/Upgrade Database*. Debe terminar con *MantisBT was installed
   successfully*.
   - El aviso `POSSIBLE PROBLEM` en "Checking URL to installation" es esperable: el instalador intenta abrir
     `localhost:<puerto>` desde dentro del contenedor, que solo escucha en el 80. No impide la instalación.
3. **Cerrar la instalación (obligatorio).** Quitar `MANTIS_ENABLE_ADMIN` del `.env` (o ponerlo en `0`) y recrear Mantis: `admin/`
   vuelve a quedar oculta (responde 404). Iniciar sesión con `administrator` / `root` y **cambiar esa contraseña de
   inmediato** (Mi cuenta): `root` deja de servir.
4. **Crear el proyecto `Rayuela Marketplace`.** Tiene que quedar con **id 1**, que es el que usa por defecto el script de carga
   (si no, definir `MANTIS_PROJECT_ID`). Agregar sus 5 categorías en Administrar → Proyectos → Rayuela Marketplace →
   Categorías (ver abajo); **solo se pueden crear por la interfaz**: la API REST de Mantis 2.28 no tiene ese endpoint.
   Después crear los usuarios de trabajo (ver "Usuarios de trabajo").
5. **Cargar las incidencias.** Crear un token en Mi cuenta → Tokens de API, guardarlo en `.env` como `MANTIS_API_TOKEN` y
   correr `node scripts/mantis-cargar-incidencias.js` (ver "Carga de incidencias"). Quedan 13 incidencias: 8 asignadas y 5
   cerradas.

Este procedimiento se verificó desde cero con secretos, en una instalación aislada: instalación, cierre de `admin/`, inicio de
sesión, cambio de contraseña, token de API, proyecto, categorías, usuarios y carga de las 13 incidencias (con una segunda
ejecución que las omite por ya existir).

## Qué obtiene quien levanta Mantis

Mantis guarda todo (incidencias, usuarios, notas y adjuntos) en su base MariaDB, que vive en el volumen local
`rayuela_mantis_db_data` de cada máquina. Por eso **cada persona levanta un Mantis vacío**: el repositorio solo trae
`incidencias.json` y el script de carga.

- **Instalar y cargar desde el repo** (pasos de arriba y "Carga de incidencias"): recrea las 13 incidencias con su estado,
  responsable y notas. No trae adjuntos, fechas originales ni historial.
- **Restaurar un volcado de la base** de quien ya la tiene armada: trae todo. Hay que pasarlo por un medio privado (contiene
  hashes de contraseñas y tokens). Conviene usar el mismo `mantis_crypto_salt` que el volcado (reemplazar
  `secrets/mantis_crypto_salt` por el de origen) para conservar las claves de RSS y los enlaces de confirmación pendientes,
  pero no es obligatorio: el salt solo interviene en las sesiones, las claves de RSS y esos enlaces; no en el inicio de
  sesión, los tokens de API ni los datos. Las contraseñas de la base no hace falta compartirlas: el volcado no las
  incluye. (Los scripts de backup y restauración del volcado todavía no están creados.)

## Categorías

`Pagos / Mercado Pago` · `Catálogo / Libros` · `Rendimiento BD` · `Seguridad & Accesos` · `Infraestructura`
(Administrar → Proyectos → Rayuela Marketplace → Categorías).

## Usuarios de trabajo

Una cuenta por integrante del grupo (nombre de usuario igual al de GitHub), con nivel *desarrollador* (gestor para
quien administra el tablero). Las contraseñas iniciales se entregan de forma privada y cada persona debe cambiarla.

## Carga de incidencias

Las incidencias están versionadas en [`incidencias.json`](incidencias.json) (descripción técnica, pasos de
reproducción, categoría, prioridad, severidad, responsable y, si corresponde, commit de solución). Se cargan con la
API REST:

```bash
# Token: Mi cuenta → Tokens de API (se guarda en .env como MANTIS_API_TOKEN, nunca en el repositorio)
node scripts/mantis-cargar-incidencias.js
```

El script es idempotente (omite las incidencias cuyo resumen ya existe) y deja las incidencias ya resueltas en
estado `Cerrada` con una nota que cita el PR y el commit de la solución.

### Incidencias registradas

| # | Categoría | Resumen | Estado |
|---|---|---|---|
| 1 | Catálogo / Libros | `getBookById` lanza error de inicialización y la petición queda colgada | Asignada |
| 2 | Rendimiento BD | El registro falla aunque crea el usuario (lectura en réplica con retraso) | Asignada |
| 3 | Infraestructura | La réplica no arranca en un volumen nuevo (rol `replicator` y regla `pg_hba`) | Asignada |
| 4 | Infraestructura | `node_exporter` no arranca en Docker Desktop para Windows | Asignada |
| 5 | Seguridad & Accesos | Rutas de la API responden 200 sin token | Asignada |
| 6 | Seguridad & Accesos | Falta control de roles (un cliente alcanza acciones de administración) | Asignada |
| 7 | Seguridad & Accesos | Contraseñas y `JWT_SECRET` por defecto en `compose.yaml` | Asignada |
| 8 | Infraestructura | El chat usa un modelo de Gemini retirado y oculta los errores | Asignada |
| 9 | Rendimiento BD | Consultas críticas con Seq Scan sobre 6 millones de filas | Cerrada (corregida) |
| 10 | Infraestructura | URLs absolutas `localhost:3000` en el frontend | Cerrada (corregida) |
| 11 | Seguridad & Accesos | Trivy detecta vulnerabilidades HIGH/CRITICAL | Cerrada (corregida) |
| 12 | Pagos / Mercado Pago | Sin alerta ni métrica de pagos fallidos | Cerrada (corregida) |
| 13 | Seguridad & Accesos | Intento de inyección SQL en el login | Cerrada (no es una incidencia) |

## Por qué esta imagen

MantisBT no tiene imagen oficial. Se evaluó armar una propia (Dockerfile con PHP + Apache y el release verificado
por SHA-256) y usar una de la comunidad. Se eligió `xlrl/mantisbt` porque se probó con nuestra base MariaDB y nuestra
configuración, y resultó más simple de armar y de mantener:

- Funciona contra MariaDB sin cambios; la API REST y el script de carga andan igual.
- Oculta `admin/` por defecto: no hay que borrar el instalador cada vez que se recrea el contenedor.
- Acepta adjuntos de hasta 5 MB (`PHP_MAX_UPLOAD_SIZE`), contra 2 MB de la imagen propia.
- No hay un Dockerfile propio que mantener: se actualiza cambiando la etiqueta y el digest del `compose.yaml`.

Contra: depende de una imagen mantenida por una sola persona. Para limitar ese riesgo la imagen se fija por
**digest** (no por etiqueta flotante), de modo que una versión reemplazada en Docker Hub no entra sin una revisión.
Para actualizar: `docker pull xlrl/mantisbt:<versión>`, copiar su digest (`docker image inspect`) y cambiar la línea
`image:` del servicio `mantis`.

## Limitaciones conocidas

- Las notificaciones por correo están desactivadas (no hay servidor SMTP configurado).
- La imagen `xlrl` ya usa la variable `MANTIS_URL` para la dirección de descarga de Mantis; por eso la URL base del
  sistema se pasa como `MANTIS_BASE_URL`.
- Las claves de Mantis son Docker Secrets (SEC-01). **No se rotan** con `scripts/rotate-secrets.js` (todavía no
  está implementado ni probado). Cambiar `mantis_crypto_salt` solo cierra las sesiones e invalida enlaces de RSS y de
  confirmación pendientes. Las contraseñas de la base, en cambio, las guarda MariaDB: si se pierden, el volumen de Mantis
  queda inaccesible. Conviene guardar una copia cifrada de `secrets/` con `scripts/backup-secrets.js`.
- `mantis-db` corre con el sistema de archivos en solo lectura y ambos servicios con `no-new-privileges`; el contenedor
  web de Mantis queda escribible (escribe en `/var/www/html` y en la configuración de PHP).
- Falta adjuntar capturas y registros como evidencia en cada incidencia y cerrar las incidencias abiertas a medida
  que se corrijan.
