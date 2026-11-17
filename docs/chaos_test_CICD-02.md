# Chaos test de CICD-02 (CARD-12)

Prueba de que el pipeline CI/CD detiene un cambio defectuoso antes de construir y publicar la
imagen. Complementa el [procedimiento de rollback](procedimiento_rollback.md), que cubre el caso
en que un cambio defectuoso sí llega al entorno.

## 1. Escenario

| Dato | Valor |
|---|---|
| Fecha | 2026-11-17 |
| Rama defectuosa | `chaos/CARD-12-libros-contrato-roto` (sale de `dev` en `9facb50`) |
| Commit defectuoso | `5d2636d` — `feat(libros): devolver el listado dentro de un objeto { libros }` |
| Cambio | `GET /api/libros` devuelve `{ "libros": [...] }` en lugar del arreglo `[...]` |
| Tipo de defecto | Cambio de contrato de la API: el código es válido, pero rompe a los consumidores |
| PR | [#17](https://github.com/hia-grupo7/hia-g07-backend/pull/17), borrador, **cerrado sin fusionar** |
| Ejecución del pipeline | [CI/CD #43993966106](https://github.com/hia-grupo7/hia-g07-backend/actions/runs/43993966106) |

El cambio es de una sola línea en `src/controllers/book.controller.js`:

```diff
-        res.json(books);
+        res.json({ libros: books });
```

## 2. Resultado esperado y obtenido

El pipeline tiene una cadena de dependencias: `Build Docker y escaneo Trivy` necesita `lint` y
`test`; `Versión semántica` y `Publicar imagen en GHCR` solo corren en `push` a `dev` o `main`.

| Etapa | Esperado | Obtenido |
|---|---|---|
| Lint (ESLint) | Pasa (el código es válido) | `success` |
| Tests unitarios | **Falla** | **`failure`** (paso `Ejecutar tests`) |
| Build Docker y escaneo Trivy | Saltado | `skipped` |
| Versión semántica | Saltado | `skipped` |
| Publicar imagen en GHCR | Saltado | `skipped` |
| Notificación de estado | Corre siempre | `success` |
| Secret Scan | Pasa | `success` |

Prueba que detectó el defecto (extracto del registro del job `Tests unitarios`):

```text
● /api/libros › GET devuelve 200 con la lista de libros
    Expected: [{"autor": "Julio Cortazar", "id": 1, "titulo": "Rayuela"}, {"autor": "Jorge Luis Borges", "id": 2, "titulo": "El Aleph"}]
    Received: {"libros": [{"autor": "Julio Cortazar", "id": 1, "titulo": "Rayuela"}, {"autor": "Jorge Luis Borges", "id": 2, "titulo": "El Aleph"}]}
Test Suites: 1 failed, 2 passed, 3 total
Tests:       1 failed, 12 passed, 13 total
##[error]Process completed with exit code 1.
```

El mismo resultado se obtuvo antes en local (`npm test`: 12 de 13 pruebas, lint sin errores).

## 3. Evidencia de que nada cambió

Comprobado después de la ejecución fallida:

| Qué | Cómo se comprobó | Resultado |
|---|---|---|
| La rama `dev` no avanzó | `GET /branches/dev` | Sigue en `9facb50` |
| No se creó versión ni release | `GET /releases` | El último sigue siendo `v1.0.0-dev.5` |
| No se construyó ni publicó imagen | Jobs `Build Docker…`, `Versión semántica` y `Publicar imagen en GHCR` | Los tres `skipped` |
| El PR no se puede fusionar | Estado del PR | `mergeable_state: blocked` |
| El PR se cerró sin merge | Estado final | `closed`, `merged: false` |

El rollback de datos y de imagen no hizo falta: ningún entorno recibió el cambio.

## 4. Qué demuestra y qué no

**Demuestra:**

- Un cambio que compila y pasa el lint, pero rompe el contrato de la API, se detiene en la
  etapa de tests.
- Al fallar los tests, las etapas siguientes no corren: no hay imagen nueva ni versión.
- El aviso de estado se emite igual y deja el resumen del pipeline.

**No demuestra (limitaciones):**

- **Bloqueo del merge por los checks.** El estado `blocked` se debe, como mínimo, a que el PR era
  borrador y no tenía aprobaciones. Los rulesets `protect-dev` y `protect-main` aún no exigen
  los checks `Lint (ESLint)`, `Tests unitarios`, `Build Docker y escaneo Trivy` y `Secret Scan`
  como obligatorios, así que con las aprobaciones necesarias un PR con tests rotos podría
  fusionarse. Es una tarea pendiente de la tarjeta.
- **Estado de GHCR.** La evidencia es que la etapa de publicación se saltó y que no hay release
  nuevo. No se listaron las etiquetas del paquete porque el acceso anónimo a
  `ghcr.io/hia-grupo7/hia-g07-backend` es denegado (el paquete está privado); queda pendiente
  dejarlo público, como indica el [procedimiento de rollback](procedimiento_rollback.md#10-alcance-y-limitaciones).
- **Defectos que los tests no cubren.** El defecto se detectó porque existe una prueba del
  contrato de `/api/libros`. Un cambio de contrato en una ruta sin prueba pasaría el pipeline;
  para eso están las pruebas de humo del procedimiento de rollback.

## 5. Cómo repetir la prueba

```bash
git fetch origin
git switch -c chaos/prueba origin/dev
# Editar src/controllers/book.controller.js: res.json(books) -> res.json({ libros: books })
git commit -am "test: [chaos] cambio de contrato en /api/libros"
git push -u origin chaos/prueba
# Abrir un PR borrador a dev, verificar que "Tests unitarios" falla y cerrarlo sin fusionar.
```
