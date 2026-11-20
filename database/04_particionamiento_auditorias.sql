-- =============================================================================
-- database/04_particionamiento_auditorias.sql
-- CARD-07 / [DB-05]: Particionamiento Declarativo por Rango Mensual en Auditorías
-- =============================================================================

-- 1. Crear tabla particionada por rango sobre la columna 'fecha'
DROP TABLE IF EXISTS public.auditorias_particionada CASCADE;

CREATE TABLE public.auditorias_particionada (
    id SERIAL,
    accion VARCHAR(255) NOT NULL,
    "tablaAfectada" VARCHAR(255) NOT NULL,
    "registroId" INTEGER,
    "usuarioId" INTEGER,
    detalle TEXT NOT NULL,
    fecha TIMESTAMP WITH TIME ZONE NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id, fecha)
) PARTITION BY RANGE (fecha);

-- 2. Creación de Particiones Físicas Mensuales (Último semestre y futuro)
CREATE TABLE public.auditorias_part_2026_09 PARTITION OF public.auditorias_particionada
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE TABLE public.auditorias_part_2026_10 PARTITION OF public.auditorias_particionada
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE public.auditorias_part_2026_11 PARTITION OF public.auditorias_particionada
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE public.auditorias_part_2026_12 PARTITION OF public.auditorias_particionada
    FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- Partición por defecto para atrapar registros históricos
CREATE TABLE public.auditorias_part_default PARTITION OF public.auditorias_particionada
    DEFAULT;

-- 3. Migrar una muestra representativa de 200.000 tuplas para demostración
INSERT INTO public.auditorias_particionada (accion, "tablaAfectada", "registroId", "usuarioId", detalle, fecha, "createdAt", "updatedAt")
SELECT accion, "tablaAfectada", "registroId", "usuarioId", detalle, fecha, "createdAt", "updatedAt"
FROM public.auditorias
LIMIT 200000;

-- 4. Demostración de Partition Pruning con EXPLAIN ANALYZE
-- El planificador descarta (poda) todas las particiones ajenas a Noviembre 2026
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) 
FROM public.auditorias_particionada
WHERE fecha >= '2026-11-01 00:00:00+00' AND fecha < '2026-12-01 00:00:00+00';
