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

1. Crear los secretos (ver "Secretos" en el README principal): `node scripts/init-secrets.js`. Genera en `secrets/`
   `mantis_db_password`, `mantis_db_root_password` y `mantis_crypto_salt`. Sin esos archivos el compose no arranca. Si ya
   tenés un volumen de Mantis, el script se niega a inventar claves nuevas (dejarían la base inaccesible): usá una
   copia cifrada (`scripts/backup-secrets.js`) o `--valores-actuales --env <archivo>`. Opcionalmente, definir
   `MANTIS_PORT` en `.env` (no es un secreto).
2. Levantar:

   ```bash
   docker compose --profile mantis up -d mantis-db mantis
   ```

3. **Primera vez (instalación del esquema).** Por seguridad la imagen mantiene oculta la carpeta `admin/`. Para
   instalar, definir `MANTIS_ENABLE_ADMIN=1` en `.env` y recrear el contenedor
   (`docker compose --profile mantis up -d mantis`). Abrir `http://localhost:8081/admin/install.php`, dejar los datos
   de conexión que ya vienen cargados, completar la contraseña de la base (el contenido de `secrets/mantis_db_password`) y, en "Admin Username/Password", usar el
   mismo usuario `mantis` y su contraseña. Pulsar *Install/Upgrade Database*.
4. **Cerrar la instalación (obligatorio):**
   - Iniciar sesión con `administrator` / `root` y **cambiar esa contraseña de inmediato** (Mi cuenta).
   - Quitar `MANTIS_ENABLE_ADMIN` del `.env` (o ponerlo en `0`) y recrear el contenedor: la imagen vuelve a ocultar
     `admin/` sola y no hay que borrar nada a mano.
5. Crear el proyecto **Rayuela Marketplace**, las categorías y los usuarios (ver abajo).

## Qué obtiene quien levanta Mantis

Mantis guarda todo (incidencias, usuarios, notas y adjuntos) en su base MariaDB, que vive en el volumen local
`rayuela_mantis_db_data` de cada máquina. Por eso **cada persona levanta un Mantis vacío**: el repositorio solo trae
`incidencias.json` y el script de carga.

- **Instalar y cargar desde el repo** (pasos de arriba y "Carga de incidencias"): recrea las 13 incidencias con su estado,
  responsable y notas. No trae adjuntos, fechas originales ni historial.
- **Restaurar un volcado de la base** de quien ya la tiene armada: trae todo. Hay que pasarlo por un medio privado (contiene
  hashes de contraseñas y tokens) y usar **el mismo `mantis_crypto_salt`** que el volcado: reemplazar `secrets/mantis_crypto_salt`
  por el de origen. Las contraseñas de la base no hace falta compartirlas: el volcado no las incluye. (Los scripts de
  backup y restauración del volcado todavía no están creados.)

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
- Las claves de Mantis son Docker Secrets (SEC-01). **No se rotan** con `scripts/rotate-secrets.js`: el
  `mantis_crypto_salt` tiene que ser el mismo en todo el grupo. Conviene guardar una copia cifrada de `secrets/` con
  `scripts/backup-secrets.js`: si se pierden, el volumen de Mantis queda inaccesible.
- `mantis-db` corre con el sistema de archivos en solo lectura y ambos servicios con `no-new-privileges`; el contenedor
  web de Mantis queda escribible (escribe en `/var/www/html` y en la configuración de PHP).
- Falta adjuntar capturas y registros como evidencia en cada incidencia y cerrar las incidencias abiertas a medida
  que se corrijan.
