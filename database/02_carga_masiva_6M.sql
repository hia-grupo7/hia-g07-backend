-- =============================================================================
-- SCRIPT: database/02_carga_masiva_6M.sql
-- CARD-06 / [DB-04]: Inyección Masiva de 6.000.000 de Registros en Auditorías
-- =============================================================================

-- 1. Medir tamaño inicial
SELECT 'Tamaño ANTES de la carga:' AS metrica, pg_size_pretty(pg_total_relation_size('auditorias')) AS tamano;

-- 2. Optimización temporal de sesión para inserción ultra rápida
SET synchronous_commit = off;
SET work_mem = '64MB';

-- 3. Inserción de 6.000.000 de filas sintéticas respetando Foreign Keys
INSERT INTO public.auditorias (accion, "tablaAfectada", "registroId", "usuarioId", detalle, fecha, "createdAt", "updatedAt")
SELECT
    CASE (i % 5)
        WHEN 0 THEN 'LOGIN'
        WHEN 1 THEN 'CONSULTA_CATALOGO'
        WHEN 2 THEN 'CREAR_RESERVA'
        WHEN 3 THEN 'CONFIRMAR_VENTA'
        ELSE 'CONSULTA_PRECIO'
    END AS accion,
    CASE (i % 4)
        WHEN 0 THEN 'libros'
        WHEN 1 THEN 'ventas'
        WHEN 2 THEN 'reservas'
        ELSE 'usuarios'
    END AS "tablaAfectada",
    (1 + (i % 1000)) AS "registroId",
    (1 + (i % 2)) AS "usuarioId",  -- Apunta a los usuarios ID 1 y 2 creados en el seed
    'Registro de auditoría transaccional evento #' || i AS detalle,
    NOW() - ((i % 730) || ' days')::interval AS fecha,
    NOW(),
    NOW()
FROM generate_series(1, 6000000) i;

-- 4. Restaurar configuración normal
SET synchronous_commit = on;

-- 5. Actualizar estadísticas del optimizador de PostgreSQL
ANALYZE public.auditorias;

-- 6. Verificación de resultados finales
SELECT 'Total filas en auditorias:' AS resultado, count(*) AS total FROM public.auditorias;

SELECT 'Tamaño DESPUÉS de la carga:' AS metrica,
       pg_size_pretty(pg_relation_size('auditorias')) AS tamano_datos,
       pg_size_pretty(pg_total_relation_size('auditorias')) AS tamano_total;