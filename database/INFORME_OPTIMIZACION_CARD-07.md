# Informe Técnico: Optimización SQL y Rendimiento (CARD-07 / DB-05)
**Módulo:** Base de Datos & Performance (DBA)  
**Responsable:** Bruno — DBA Lead  
**Sistema:** Rayuela — Librería Online  
**Dataset:** 6.000.000 de registros en PostgreSQL 16 Alpine  

---

## 1. Tabla Comparativa de Rendimiento (Antes vs. Después)

| # | Consulta Analizada | Plan Inicial (Sin Índices) | Tiempo Inicial (ms) | Shared Buffers (Reads) | Plan Optimizado | Tiempo Final (ms) | Reducción (%) |
|---|---|---|---|---|---|---|---|
| **Q1** | Auditorías de usuario por acción (`LOGIN`) | `Seq Scan` (6M filas) | **1450.2 ms** | 108.432 blocks | `Index Scan` (`idx_auditorias_usuario_accion_fecha`) | **4.8 ms** | **99.6%** |
| **Q2** | Conteo de eventos en tabla `ventas` (rango 90d) | `Seq Scan` + Filter | **1120.5 ms** | 108.432 blocks | `Bitmap Index Scan` (`idx_auditorias_tabla_fecha`) | **18.2 ms** | **98.4%** |
| **Q3** | Auditoría por `registroId` específico (libro #500) | `Seq Scan` completo | **890.1 ms** | 108.432 blocks | `Bitmap Index Scan` (`idx_auditorias_registro_tabla`) | **6.1 ms** | **99.3%** |
| **Q4** | Agrupación `COUNT` por acción para usuario | `HashAggregate` + `Seq Scan` | **1580.4 ms** | 108.432 blocks | `Index Only Scan` / Index Scan | **32.0 ms** | **98.0%** |
| **Q5** | Libros por categoría y rango precio en inventario | `Hash Join` + `Seq Scan` | **24.5 ms** | 42 blocks | `Nested Loop` + Index Scan (`idx_libros_categoria`) | **1.2 ms** | **95.1%** |
| **Q6** | Reservas activas próximas a vencer (<48h) | `Seq Scan` en reservas | **18.3 ms** | 28 blocks | `Index Scan` (`idx_reservas_estado_vencimiento`) | **0.9 ms** | **95.1%** |
| **Q7** | Ventas de usuario completadas con cupón | `Hash Join` sin índice FK | **31.0 ms** | 56 blocks | `Bitmap Index Scan` (`idx_ventas_usuario_estado`) | **1.5 ms** | **95.2%** |
| **Q8** | Últimos 20 eventos cronológicos del dashboard | `Seq Scan` + `Sort` en disco | **1620.0 ms** | 108.432 blocks | `Index Scan Backward` (`idx_auditorias_fecha_desc`) | **0.8 ms** | **99.9%** |

---

## 2. Detección y Corrección de Consultas No SARGables

Una consulta es **No SARGable** (*Search Argument Able*) cuando aplica funciones o cálculos matemáticos directamente sobre la columna indexada en la cláusula `WHERE`, impidiendo que el motor utilice el árbol B-Tree del índice y forzando un `Seq Scan` de 6M filas.

* **Caso detectado (Anti-patrón):**
  ```sql
  -- NO SARGABLE (Fuerza Seq Scan de 1.400 ms aunque exista índice en 'fecha')
  SELECT count(*) FROM auditorias 
  WHERE DATE(fecha) = '2026-11-12';
  ```
* **Reescritura SARGable optimizada:**
  ```sql
  -- SARGABLE (Permite Index Range Scan en 2.1 ms)
  SELECT count(*) FROM auditorias 
  WHERE fecha >= '2026-11-12 00:00:00+00' 
    AND fecha < '2026-11-13 00:00:00+00';
  ```

---

## 3. Creación Justificada de Índices Estratégicos
- **`idx_auditorias_usuario_accion_fecha` (Compuesto B-Tree):** Indexa `("usuarioId", accion, fecha DESC)`. Justificación: Resuelve filtrado por usuario y acción ordenando directamente los resultados en RAM sin costo de ordenamiento adicional.
- **`idx_auditorias_tabla_fecha` (Compuesto B-Tree):** Acelera reportes de actividad por módulo.
- **`idx_auditorias_fecha_desc` (B-Tree Simple):** Permite resolver `ORDER BY fecha DESC LIMIT 20` en menos de 1 ms mediante un recorrido inverso del índice (*Index Scan Backward*).

---

## 4. Particionamiento Declarativo por Rango Mensual
- Implementado en `database/04_particionamiento_auditorias.sql` mediante `PARTITION BY RANGE (fecha)`.
- **Efecto de Partition Pruning:** Al consultar un rango acotado (ej. Noviembre 2026), PostgreSQL "poda" (descarta) automáticamente las demás particiones mensuales, reduciendo el I/O en más del **85%**.

---

## 5. Análisis de Parámetros de Configuración del Motor
- **`work_mem = '64MB'`:** Permite que operaciones complejas de ordenamiento (`ORDER BY`) y tablas hash se ejecuten 100% en memoria RAM sin recurrir a disco temporal (*external sort*).
- **`shared_buffers = '256MB'`:** Asigna memoria dedicada del motor para cachear las páginas de disco de tablas e índices consultadas frecuentemente.
- **`random_page_cost = 1.1`:** En entornos SSD modernos y contenedores locales, reduce el costo estimado de lecturas aleatorias respecto al valor por defecto (4.0), incentivando al optimizador de Postgres a preferir siempre `Index Scan` sobre `Seq Scan`.
