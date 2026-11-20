-- =============================================================================
-- SCRIPT: database/05_carga_masiva_2M_ventas_accesos.sql
-- CARD-06 / [DB-04]: carga sintética de 2.000.000 de filas en cada una de estas tablas:
--   ventas, venta_detalles (1 por venta) e historial_accesos.
-- *** ARCHIVO TEMPORAL DE PRUEBAS ***
-- Carga reducida a 1/3 (2M por tabla) para probar rápido. NO es el dataset del proyecto:
-- DB-04 pide >= 6.000.000 de filas por tabla. Para el proyecto hay que cargar el volumen completo
-- (ejecutar este mismo script con -v n=6000000) y no presentar los 2M como dataset final.
-- Requisitos: tablas creadas, y libros (ids 1..12) y usuarios (ids 1..6) ya cargados.
-- Integridad: todas las claves foráneas apuntan a filas existentes (se verifica al final).
-- Se ejecuta en una sola transacción: si algo falla, no queda nada a medias.
-- Uso:         docker exec -i rayuela-db-primary psql -U postgres -v ON_ERROR_STOP=1 < database/05_carga_masiva_2M_ventas_accesos.sql
-- Volumen real: docker exec -i rayuela-db-primary psql -U postgres -v ON_ERROR_STOP=1 -v n=6000000 < database/05_carga_masiva_2M_ventas_accesos.sql
-- =============================================================================

-- Volumen por defecto: 2.000.000 (se puede cambiar con -v n=...)
\if :{?n}
\else
\set n 2000000
\endif
\timing on

BEGIN;
SET LOCAL synchronous_commit = off;
SET LOCAL work_mem = '64MB';

-- 1. Cupones de ejemplo (pocos: son datos maestros, no transaccionales)
INSERT INTO public.cupones (codigo, "porcentajeDescuento", "fechaVencimiento", "usosMaximos", "usosActuales", activo, "createdAt", "updatedAt")
SELECT 'PRUEBA' || lpad(i::text, 3, '0'),
       (5 + (i % 6) * 5),                       -- 5% a 30%
       NOW() + interval '365 days',
       1000000, 0, true, NOW(), NOW()
FROM generate_series(1, 20) i
ON CONFLICT (codigo) DO NOTHING;

-- 2. Ventas. El importe sale de la misma fórmula que el detalle, así total = cantidad * precio.
--    Cantidad: 1 a 3 | precio: 5000 a 14750 | ~10% usa cupón | estados repartidos.
INSERT INTO public.ventas (id, "idUsuario", "idCupon", total, estado, "createdAt", "updatedAt")
SELECT i,
       1 + (i % 6),
       CASE WHEN i % 10 = 0 THEN (SELECT min(id) FROM public.cupones WHERE codigo LIKE 'PRUEBA%') + (i % 20) END,
       (1 + (i % 3)) * (5000 + (i % 40) * 250),
       CASE (i % 10) WHEN 0 THEN 'pendiente' WHEN 1 THEN 'cancelada' ELSE 'completada' END,
       d.f, d.f
FROM generate_series(1, :n) i
CROSS JOIN LATERAL (SELECT NOW() - ((i % 730) || ' days')::interval - ((i % 1440) || ' minutes')::interval AS f) d;

-- 3. Detalle de ventas: una línea por venta, con la misma cantidad y precio que usó la venta.
INSERT INTO public.venta_detalles (id, cantidad, "precioUnitario", "idVenta", "idLibro")
SELECT i,
       1 + (i % 3),
       5000 + (i % 40) * 250,
       i,
       1 + (i % 12)
FROM generate_series(1, :n) i;

-- 4. Historial de accesos
INSERT INTO public.historial_accesos (id, fecha, ip, dispositivo, "usuarioId")
SELECT 1000 + i,                                  -- los ids bajos ya los usa la aplicación
       NOW() - ((i % 730) || ' days')::interval - ((i % 86400) || ' seconds')::interval,
       '192.168.' || (i % 250) || '.' || (1 + (i % 250)),
       CASE (i % 4) WHEN 0 THEN 'Chrome / Windows' WHEN 1 THEN 'Firefox / Linux' WHEN 2 THEN 'Safari / iOS' ELSE 'Chrome / Android' END,
       1 + (i % 6)
FROM generate_series(1, :n) i;

-- 5. Dejar las secuencias después del último id usado (para que la aplicación siga insertando sin chocar)
SELECT setval('ventas_id_seq',            (SELECT max(id) FROM public.ventas));
SELECT setval('venta_detalles_id_seq',    (SELECT max(id) FROM public.venta_detalles));
SELECT setval('historial_accesos_id_seq', (SELECT max(id) FROM public.historial_accesos));
COMMIT;

-- 6. Estadísticas para el optimizador
ANALYZE public.ventas;
ANALYZE public.venta_detalles;
ANALYZE public.historial_accesos;
ANALYZE public.cupones;

-- 7. Verificación
SELECT 'ventas' AS tabla, count(*) AS filas, pg_size_pretty(pg_total_relation_size('ventas')) AS tamano FROM public.ventas
UNION ALL SELECT 'venta_detalles', count(*), pg_size_pretty(pg_total_relation_size('venta_detalles')) FROM public.venta_detalles
UNION ALL SELECT 'historial_accesos', count(*), pg_size_pretty(pg_total_relation_size('historial_accesos')) FROM public.historial_accesos;

SELECT 'huerfanos venta_detalles->ventas' AS control, count(*) AS total
FROM public.venta_detalles d LEFT JOIN public.ventas v ON v.id = d."idVenta" WHERE v.id IS NULL
UNION ALL SELECT 'huerfanos venta_detalles->libros', count(*)
FROM public.venta_detalles d LEFT JOIN public.libros l ON l.id = d."idLibro" WHERE l.id IS NULL
UNION ALL SELECT 'huerfanos ventas->usuarios', count(*)
FROM public.ventas v LEFT JOIN public.usuarios u ON u.id = v."idUsuario" WHERE u.id IS NULL
UNION ALL SELECT 'huerfanos ventas->cupones', count(*)
FROM public.ventas v LEFT JOIN public.cupones c ON c.id = v."idCupon" WHERE v."idCupon" IS NOT NULL AND c.id IS NULL
UNION ALL SELECT 'huerfanos accesos->usuarios', count(*)
FROM public.historial_accesos h LEFT JOIN public.usuarios u ON u.id = h."usuarioId" WHERE u.id IS NULL
UNION ALL SELECT 'ventas con total != cantidad*precio', count(*)
FROM public.ventas v JOIN public.venta_detalles d ON d."idVenta" = v.id WHERE v.total <> d.cantidad * d."precioUnitario";

SELECT 'tamano total de la base' AS metrica, pg_size_pretty(pg_database_size(current_database())) AS valor;
