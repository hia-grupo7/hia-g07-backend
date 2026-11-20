-- =============================================================================
-- SCRIPT: database/06_carga_masiva_2M_reservas.sql
-- CARD-06 / [DB-04]: carga sintética de 2.000.000 de reservas.
-- *** ARCHIVO TEMPORAL DE PRUEBAS ***
-- Carga reducida a 1/3 para probar rápido. NO es el dataset del proyecto: DB-04 pide >= 6.000.000
-- de filas por tabla. Para el proyecto hay que cargar el volumen completo (ejecutar este mismo
-- script con -v n=6000000) y no presentar los 2M como dataset final.
-- Requisitos: libros (ids 1..12) y usuarios (ids 1..6) cargados.
-- Distribución: cada reserva dura 7 días; las que aún no vencieron están 'activa' y el resto se reparte
-- entre 'completada', 'vencida' y 'cancelada'. Así la consulta "activas próximas a vencer (<48 h)" es
-- selectiva (menos del 1 % de la tabla), como ocurre en producción.
-- Una sola transacción: si falla, no queda nada a medias.
-- Uso:         docker exec -i rayuela-db-primary psql -U postgres -v ON_ERROR_STOP=1 < database/06_carga_masiva_2M_reservas.sql
-- Volumen real: docker exec -i rayuela-db-primary psql -U postgres -v ON_ERROR_STOP=1 -v n=6000000 < database/06_carga_masiva_2M_reservas.sql
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

INSERT INTO public.reservas (id, "idUsuario", "fechaReserva", "fechaVencimiento", estado, "createdAt", "updatedAt", "idLibro")
SELECT i,
       1 + (i % 6),
       d.reserva,
       d.reserva + interval '7 days',
       CASE
         WHEN d.reserva + interval '7 days' > NOW() THEN 'activa'
         ELSE (CASE (i % 3) WHEN 0 THEN 'completada' WHEN 1 THEN 'vencida' ELSE 'cancelada' END)
       END,
       d.reserva, d.reserva,
       1 + (i % 12)
FROM generate_series(1, :n) i
CROSS JOIN LATERAL (
  SELECT NOW() - ((i % 365) || ' days')::interval - ((i % 86400) || ' seconds')::interval AS reserva
) d;

SELECT setval('reservas_id_seq', (SELECT max(id) FROM public.reservas));
COMMIT;

ANALYZE public.reservas;

SELECT estado, count(*) AS filas FROM public.reservas GROUP BY estado ORDER BY 2 DESC;

SELECT 'reservas' AS tabla, count(*) AS filas, pg_size_pretty(pg_total_relation_size('reservas')) AS tamano FROM public.reservas;

SELECT 'activas que vencen en < 48 h (Q6)' AS control, count(*) AS total
FROM public.reservas WHERE estado = 'activa' AND "fechaVencimiento" BETWEEN NOW() AND NOW() + interval '48 hours';

SELECT 'huerfanos reservas->usuarios' AS control, count(*) AS total
FROM public.reservas r LEFT JOIN public.usuarios u ON u.id = r."idUsuario" WHERE u.id IS NULL
UNION ALL SELECT 'huerfanos reservas->libros', count(*)
FROM public.reservas r LEFT JOIN public.libros l ON l.id = r."idLibro" WHERE r."idLibro" IS NOT NULL AND l.id IS NULL;
