# Reporte Métrico — Carga Masiva de 6.000.000 Registros (CARD-06)
**Módulo:** Base de Datos & Performance (DBA)  
**Responsable:** Bruno — DBA Lead  
**Tabla Seleccionada:** `public.auditorias`  
**Motor:** PostgreSQL 16.15 (Alpine) en Contenedor Docker  

---

### 1. Script Reproducible de Inyección
- Archivo versionado: `database/generate_data.sql` (y `database/02_carga_masiva_6M.sql`).
- Método: `generate_series(1, 6000000)` con optimización temporal de sesión (`synchronous_commit = off` y `work_mem = '64MB'`).

---

### 2. Conteo de Registros
```sql
SELECT count(*) FROM auditorias;
-- Resultado: 6000000 filas
```

---

### 3. Verificación de Integridad Relacional (Sin Huérfanos)
```sql
SELECT count(*) AS huerfanos 
FROM auditorias a 
LEFT JOIN usuarios u ON a."usuarioId" = u.id 
WHERE u.id IS NULL;
-- Resultado: 0 huérfanos (100% de los registros apuntan a claves válidas de usuarios)
```

---

### 4. Métricas de Tiempo de Carga y Almacenamiento
* **Tiempo total de inyección:** ~25 segundos.
* **Tamaño antes de la carga:** 8 kB (tabla vacía).
* **Tamaño de datos (`pg_relation_size`):** 847 MB.
* **Tamaño de índices (`pg_indexes_size`):** 129 MB.
* **Tamaño total de la tabla (`pg_total_relation_size`):** 976 MB.
* **Tamaño total de la base de datos `postgres`:** 984 MB (~0.98 GB).

---

### 5. Impacto en los Tiempos de Backup (pg_dump)
* **Tiempo de backup previo (base vacía / catálogo inicial):** < 0.5 segundos (~45 KB).
* **Tiempo de backup tras inyección masiva (6M filas):** **13.77 segundos** (~180 MB comprimido en formato Custom `-Fc`).
* **Conclusión:** El tiempo de backup se incrementó en orden de magnitud pero se mantiene dentro de los límites operativos tolerables gracias a la compresión nativa de PostgreSQL.
