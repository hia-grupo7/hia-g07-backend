-- =============================================================================
-- database/03_optimizacion_explain.sql
-- CARD-07 / [DB-05]: Optimización de 8 Consultas Críticas con EXPLAIN ANALYZE
-- =============================================================================

-- -----------------------------------------------------------------------------
-- CONSULTA 1: Filtrar auditorías de un usuario por acción específica
-- Problema: Seq Scan sobre 6.000.000 de tuplas
-- -----------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.auditorias 
WHERE "usuarioId" = 1 AND accion = 'LOGIN'
ORDER BY fecha DESC LIMIT 50;

-- -----------------------------------------------------------------------------
-- CONSULTA 2: Conteo de eventos de una tabla afectada en un rango de fechas
-- -----------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM public.auditorias 
WHERE "tablaAfectada" = 'ventas' 
  AND fecha >= NOW() - interval '90 days';

-- -----------------------------------------------------------------------------
-- CONSULTA 3: Auditorías por registro específico modificado
-- -----------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT accion, detalle, fecha FROM public.auditorias 
WHERE "registroId" = 500 AND "tablaAfectada" = 'libros';

-- -----------------------------------------------------------------------------
-- CONSULTA 4: Agrupación y total de auditorías por acción y usuario
-- -----------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT accion, count(*) AS total_eventos 
FROM public.auditorias 
WHERE "usuarioId" = 2 
GROUP BY accion;

-- -----------------------------------------------------------------------------
-- CONSULTA 5: Búsqueda de libros por categoría y precio en inventario (JOIN)
-- -----------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT l.title, l.author, i.price, i.stock 
FROM public.libros l 
JOIN public.inventory i ON l.id = i."bookId"
WHERE l.category = 'FICTION' AND i.price BETWEEN 500 AND 1500;

-- -----------------------------------------------------------------------------
-- CONSULTA 6: Reservas activas próximas a vencer
-- -----------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.reservas 
WHERE estado = 'activa' 
  AND "fechaVencimiento" BETWEEN NOW() AND NOW() + interval '48 hours';

-- -----------------------------------------------------------------------------
-- CONSULTA 7: Historial de ventas de un usuario con cupón aplicado
-- -----------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT v.id, v.total, v.estado, c.codigo AS cupon_aplicado
FROM public.ventas v
LEFT JOIN public.cupones c ON v."idCupon" = c.id
WHERE v."idUsuario" = 1 AND v.estado = 'completada';

-- -----------------------------------------------------------------------------
-- CONSULTA 8: Búsqueda de eventos recientes para el dashboard de auditoría
-- -----------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, accion, "tablaAfectada", fecha 
FROM public.auditorias 
ORDER BY fecha DESC 
LIMIT 20;

-- =============================================================================
-- CREACIÓN DE ÍNDICES ESTRATÉGICOS (Solución al cuello de botella)
-- =============================================================================

-- Índice compuesto para consultas por usuario y acción (Consultas 1 y 4)
CREATE INDEX IF NOT EXISTS idx_auditorias_usuario_accion_fecha 
ON public.auditorias ("usuarioId", accion, fecha DESC);

-- Índice compuesto para rango de fechas y tabla afectada (Consulta 2)
CREATE INDEX IF NOT EXISTS idx_auditorias_tabla_fecha 
ON public.auditorias ("tablaAfectada", fecha);

-- Índice para rastrear cambios en registros específicos (Consulta 3)
CREATE INDEX IF NOT EXISTS idx_auditorias_registro_tabla 
ON public.auditorias ("tablaAfectada", "registroId");

-- Índice B-Tree puro para ordenamiento cronológico global (Consulta 8)
CREATE INDEX IF NOT EXISTS idx_auditorias_fecha_desc 
ON public.auditorias (fecha DESC);

-- Índices en tablas relacionales para acelerar búsquedas de negocio (Consultas 5, 6 y 7)
CREATE INDEX IF NOT EXISTS idx_libros_categoria ON public.libros (category);
CREATE INDEX IF NOT EXISTS idx_inventory_precio ON public.inventory (price);
CREATE INDEX IF NOT EXISTS idx_reservas_estado_vencimiento ON public.reservas (estado, "fechaVencimiento");
CREATE INDEX IF NOT EXISTS idx_ventas_usuario_estado ON public.ventas ("idUsuario", estado);

-- Actualizar estadísticas con los nuevos índices
ANALYZE;