# Procedimiento de rollback

Tarjeta CICD-02 (CARD-12) · Responsable: Grupo 07, rol CI/CD

Esta guía explica cómo volver a una versión estable del backend cuando una publicación
nueva se comporta mal en el entorno en ejecución. Fue ensayada en el entorno de laboratorio
(ver [sección 8](#8-registro-del-ensayo-de-laboratorio)).

## 1. Cuándo aplicarla

Aplicar el rollback **primero** y diagnosticar **después** si ocurre cualquiera de estos casos
tras desplegar una versión nueva:

| Señal | Cómo se ve |
|---|---|
| El health check falla | `GET /api/health` no responde 200, o el contenedor queda `unhealthy` |
| Fallan las pruebas de humo | `GET /api/libros` no devuelve un arreglo JSON (ver sección 3) |
| Errores 5xx sostenidos | Alerta en Grafana o aumento de errores en los logs de Loki |
| Funcionalidad rota reportada | El frontend no muestra el catálogo, no se puede iniciar sesión, etc. |

> El health check por sí solo **no alcanza**: en el ensayo, una versión que rompía el contrato
> de `/api/libros` seguía respondiendo 200 en `/api/health`. Por eso las pruebas de humo de la
> sección 3 son parte obligatoria del despliegue.

## 2. Estrategia: cuatro niveles

Se usa el nivel más bajo que resuelva el problema.

| Nivel | Qué hace | Tiempo | Cuándo usarlo |
|---|---|---|---|
| 1. Volver de slot (Blue/Green) | Vuelve el tráfico al slot anterior, que sigue levantado | Segundos | La versión previa sigue corriendo en el otro slot |
| 2. Redesplegar imagen anterior | Levanta una imagen anterior en un slot y conmuta | 1 a 3 minutos | El slot anterior ya se apagó o se recreó |
| 3. Revertir el código | `git revert` + PR; el pipeline publica una versión nueva | 10 a 20 minutos | Hay que corregir el repositorio para que no vuelva a pasar |
| 4. Restaurar la base de datos | Restaura un backup con `backup/restore.sh` | Depende del tamaño | Solo si la versión defectuosa alteró o dañó datos |

El nivel 3 es siempre complementario: después de estabilizar (nivel 1 o 2) hay que dejar el
repositorio coherente con lo que corre en producción.

## 3. Pruebas de humo (antes y después de cada conmutación)

Ejecutar contra el proxy (puerto 80). Ambas deben dar el resultado esperado:

```bash
# 1) Salud del backend: debe imprimir 200
curl -s -o /dev/null -w "health: %{http_code}\n" http://localhost/api/health

# 2) Contrato de /api/libros: debe imprimir 200 y el primer carácter del cuerpo debe ser [
curl -s -o /dev/null -w "libros: %{http_code}\n" http://localhost/api/libros
curl -s http://localhost/api/libros | head -c 1; echo
```

Resultado esperado: `health: 200`, `libros: 200` y `[`. Si el primer carácter es `{`,
el contrato está roto aunque el código sea 200.

## 4. Prerrequisito: cómo se despliega una versión (y por qué permite el rollback)

`compose.yaml` define dos slots, `backend-blue` y `backend-green`. Cada uno toma su imagen de
una variable, con un valor por defecto:

| Variable | Slot | Valor por defecto |
|---|---|---|
| `BACKEND_BLUE_IMAGE` | blue | `rayuela-backend:1.1.0` |
| `BACKEND_GREEN_IMAGE` | green | `rayuela-backend:1.1.0` |

Para desplegar una versión nueva **siempre se usa el slot inactivo**, y el slot activo no se
apaga hasta validar la versión nueva:

```bash
# Ejemplo: el slot activo es blue; se despliega la versión nueva en green
export BACKEND_GREEN_IMAGE=ghcr.io/hia-grupo7/hia-g07-backend:1.0.0-dev.5
docker compose --profile green up -d --no-deps backend-green
docker inspect -f '{{.State.Health.Status}}' rayuela-backend-green   # esperar "healthy"
```

Luego se conmuta el tráfico (sección 5, pasos 3 y 4, apuntando a `green`) y se corren las
pruebas de humo. **No apagar el slot anterior** (responder `N` si el script de conmutación
lo ofrece) hasta que la versión nueva esté validada: ese slot es el destino del rollback.

Las imágenes publicadas por el pipeline están en
`ghcr.io/hia-grupo7/hia-g07-backend`, con la etiqueta de versión exacta (por ejemplo
`1.0.0-dev.5`) y la etiqueta móvil `dev` o `latest`. Para volver a una versión conocida
conviene usar la etiqueta de versión exacta, nunca la móvil.

> **Compatibilidad con los secretos (SEC-01 / CARD-20).** Desde SEC-01 el backend lee sus claves de archivos
> (`*_FILE`, montados en `/run/secrets`) y el compose ya no le pasa `JWT_SECRET` ni `DB_PASSWORD` como variables.
> Una imagen **anterior** a SEC-01 no sabe leer esos archivos: probada con el compose nuevo, entra en bucle de
> reinicio con `password authentication failed for user "postgres"` (usa su valor por defecto `admin123`, que ya no
> coincide si se rotó la clave) y, aunque conectara, no tendría `JWT_SECRET` para firmar tokens. Por eso este
> procedimiento solo sirve para volver a versiones **desde SEC-01 en adelante**. Para una versión anterior hay que
> pasarle las variables a mano (por ejemplo con un `docker-compose.override.yml` temporal) y volver al compose actual
> cuanto antes.
>
> La etiqueta local por defecto del backend cambió a `1.1.0` en SEC-01: quien no reconstruyó la imagen recibe
> `pull access denied for rayuela-backend` en lugar de arrancar sin avisar con una imagen vieja.

## 5. Nivel 1 — Rollback por conmutación de slot

Supuesto: el slot defectuoso es `green` y el slot estable (`blue`) sigue levantado.
Para el caso inverso, intercambiar `blue` y `green` en todos los comandos.

```bash
# Paso 1. Confirmar que el slot estable sigue sano
docker inspect -f '{{.State.Health.Status}}' rayuela-backend-blue    # debe decir "healthy"

# Paso 2. (Opcional) anotar la hora y el estado para el informe del incidente
date; docker ps --filter name=rayuela-backend --format '{{.Names}} {{.Image}} {{.Status}}'

# Paso 3. Apuntar el upstream de Nginx al slot estable
sed -i "s|server backend-.*:3000;|server backend-blue:3000;|g" nginx/conf.d/default.conf
grep "server backend" nginx/conf.d/default.conf       # debe mostrar backend-blue:3000

# Paso 4. Recargar Nginx sin cortar conexiones en curso
docker exec rayuela-nginx-proxy nginx -s reload

# Paso 5. Verificar con las pruebas de humo (sección 3)
```

Alternativa con el script del repositorio:

```bash
printf 'N\n' | bash scripts/switch-bluegreen.sh blue    # "N" = no apagar el slot defectuoso aún
```

> **Limitación conocida del script.** `switch-bluegreen.sh` ejecuta
> `docker compose --profile <slot> up -d`, que intenta levantar **todo el stack**. Si algún
> servicio ajeno al backend no puede iniciar (en Docker Desktop para Windows,
> `node-exporter` falla con `path / is mounted on / but it is not a shared or slave mount`),
> el script se aborta con error **antes** de tocar Nginx. En ese caso el tráfico no se movió
> (no hay daño), pero hay que usar los pasos manuales de arriba, que solo dependen del slot.

Tras confirmar que el servicio se recuperó:

```bash
# Paso 6. Retirar el slot defectuoso
docker rm -f rayuela-backend-green
unset BACKEND_GREEN_IMAGE
```

## 6. Nivel 2 — Redesplegar una imagen anterior

Usar cuando el slot estable ya no está disponible.

```bash
# 1. Elegir la última versión buena (ver releases del repositorio en GitHub)
export BACKEND_BLUE_IMAGE=ghcr.io/hia-grupo7/hia-g07-backend:<version-anterior>

# 2. Recrear el slot con esa imagen y esperar a que esté sano
docker compose --profile blue up -d --no-deps --force-recreate backend-blue
docker inspect -f '{{.State.Health.Status}}' rayuela-backend-blue

# 3. Conmutar el tráfico (pasos 3 y 4 de la sección 5) y verificar (sección 3)
```

Si el paquete de GHCR no es accesible, usar una imagen local con etiqueta conocida
(`docker images rayuela-backend`) o reconstruir desde el tag de Git de la versión buena:

```bash
git checkout v<version-anterior>
docker build -t rayuela-backend:<version-anterior> .
git checkout dev
```

## 7. Niveles 3 y 4 — Código y datos

**Nivel 3. Revertir el código.** Con el servicio estabilizado, revertir el cambio defectuoso
en el repositorio. No se reescribe el historial de `dev` ni de `main` (están protegidas).

```bash
git switch -c fix/CARD-XX-revertir-<cambio> origin/dev
git revert <sha-del-commit-defectuoso>        # si se fusionó con squash, es un único commit
git push -u origin fix/CARD-XX-revertir-<cambio>
# Abrir un PR a dev con título: revert(<ámbito>): <qué se revierte>
```

Al fusionarse, el pipeline vuelve a probar, escanear y publicar, y semantic-release genera
una versión nueva con el cambio revertido.

**Nivel 4. Restaurar la base de datos.** Solo si la versión defectuosa escribió datos
incorrectos o aplicó cambios de esquema. El servicio `backup` (CARD-05, scripts en `backup/`)
genera un volcado diario a las 03:00 en el volumen `rayuela_backups_data`. Restaurar **primero en
una base de prueba** y validar antes de tocar la de producción:

```bash
# Dentro del contenedor de backup: restaura en una base nueva (no pisa la original)
docker exec rayuela-backup restore.sh /backups/<archivo>.sql.gz rayuela_restore
```

> El servicio `backup` está definido en `compose.yaml` (CARD-05) y toma la contraseña de la base del secreto
> `db_password` (SEC-01). Antes de depender de este nivel hay que confirmar que el contenedor `rayuela-backup`
> está en ejecución (`docker ps`) y probar una restauración en una base de prueba con el comando de arriba.

Un rollback de datos pierde lo escrito después del backup: decidirlo con el grupo y registrar
la pérdida en el incidente.

## 8. Registro del ensayo de laboratorio

Ensayo realizado el 2026-11-15 en el entorno local del Responsable 3 (Docker Desktop,
stack completo con slot blue activo). La versión defectuosa es la del chaos test de CICD-02
(`/api/libros` devuelve `{ "libros": [...] }` en lugar de `[...]`); ver
[PR #17](https://github.com/hia-grupo7/hia-g07-backend/pull/17), cerrado sin fusionar: allí está la
ejecución del pipeline que lo detuvo.

| Paso | Qué se hizo | Resultado |
|---|---|---|
| Línea base | Slot blue con `rayuela-backend:1.0.0`, upstream en blue | `health` 200; `/api/libros` 200 y arreglo |
| Despliegue | Slot green con la imagen defectuosa (`BACKEND_GREEN_IMAGE`) | Green `healthy` en menos de 15 segundos: **el health check no la detectó** |
| Conmutación | Upstream de Nginx a green + `nginx -s reload` | `health` 200, pero `/api/libros` devolvía un objeto: **falla detectada solo por la prueba de humo** |
| Rollback (nivel 1) | Upstream de Nginx a blue + `nginx -s reload` | Ejecutado en **699 ms**; `health` 200 y `/api/libros` 200 con arreglo |
| Limpieza | `docker rm -f rayuela-backend-green` | Estado idéntico a la línea base |

Una sonda consultó `/api/libros` cada 0,5 segundos durante todo el ensayo: 52 muestras, **todas con
código 200** (sin interrupción del servicio). La forma de la respuesta fue arreglo hasta la
conmutación, objeto durante unos 12 segundos con la versión defectuosa en servicio y arreglo de
nuevo tras el rollback. Los 12 segundos incluyen la espera manual entre pasos del ensayo; el
rollback en sí tomó menos de un segundo.

Hallazgo durante el ensayo: el primer intento con `switch-bluegreen.sh` se abortó por la
limitación descrita en la sección 5. El tráfico no se movió y el entorno quedó intacto.

## 9. Después del incidente

1. Registrar el incidente en MantisBT: versión defectuosa, síntoma, hora de detección, hora de
   recuperación, nivel de rollback usado y enlace al PR del arreglo.
2. Etiquetar o anotar en el release de GitHub que esa versión es defectuosa. No se borran tags
   ni releases publicados.
3. Corregir la causa en una rama nueva con una prueba que habría detectado el problema.
4. Si el health check no lo detectó, agregar la verificación faltante a las pruebas de humo.

## 10. Alcance y limitaciones

- El rollback por slot cubre el **backend**. El frontend (`rayuela-frontend`) no tiene slots:
  su rollback es recrear el contenedor con una imagen anterior (nivel 2).
- Las imágenes de GHCR deben estar en visibilidad pública (o el entorno autenticado en
  `ghcr.io`) para poder descargarlas; al momento de redactar esta guía eso no estaba verificado.
- El ensayo se hizo en una sola máquina; en un servidor compartido, los comandos son los mismos.
