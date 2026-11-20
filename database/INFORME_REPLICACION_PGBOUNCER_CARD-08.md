# Informe Técnico: Replicación Streaming, PgBouncer y Read/Write Splitting (CARD-08 / DB-06)
**Módulo:** Base de Datos & Performance (DBA)  
**Responsable:** Bruno — DBA Lead  
**Sistema:** Rayuela — Librería Online  
**Arquitectura:** PostgreSQL 16 Primario (RW) + Réplica Standby (RO) + PgBouncer (Port 6432)  

---

## 1. Topología del Clúster Implementado

```
                          ┌────────────────────────┐
                          │   Backend Node.js API  │
                          │   (Read/Write Splitting)│
                          └─────┬────────────┬─────┘
                                │            │
           Consultas INSERT/UPDATE           │ Consultas SELECT
           (Puerto 6432 / 5432) │            │ (Puerto 5433)
                                ▼            ▼
                 ┌──────────────────┐    ┌──────────────────┐
                 │ rayuela-pgbouncer│    │rayuela-db-replica│
                 │   (Port: 6432)   │    │  (Port: 5433)    │
                 └────────┬─────────┘    │  (Hot Standby)   │
                          │              └────────▲─────────┘
                          ▼                       │
                 ┌──────────────────┐             │
                 │rayuela-db-primary│─────────────┘
                 │   (Port: 5432)   │   WAL Streaming (Asíncrono)
                 └──────────────────┘
```

---

## 2. Parámetros de Replicación del Motor (PostgreSQL 16)
* **`wal_level = replica`**: Garantiza la generación de suficiente información de transacciones en el Write-Ahead Log.
* **`max_wal_senders = 10`**: Soporta procesos concurrentes de transmisión de réplicas y utilitarios de backup.
* **`hot_standby = on`**: Permite la ejecución de consultas `SELECT` mientras la réplica continúa aplicando registros WAL.
* **`synchronous_commit = on`**: Asegura consistencia ACID estricta en el nodo primario.

---

## 3. Estado de Replicación en Tiempo Real (`pg_stat_replication`)
Consulta ejecutada sobre el nodo primario:
```sql
SELECT application_name, client_addr, state, sync_state, replay_lag 
FROM pg_stat_replication;
```
**Resultado Verificado:**
```
 application_name | client_addr |   state   | sync_state | replay_lag 
------------------+-------------+-----------+------------+------------
 walreceiver      | 172.21.0.9  | streaming | async      | 00:00:00
```
* **Diagnóstico:** Estado `streaming` continuo. El búfer de reproducción procesa los cambios sin encolamiento (`lag = 0`).

---

## 4. Connection Pooling con PgBouncer (Puerto 6432)
* **Servicio:** `rayuela-pgbouncer` en `compose.yaml`.
* **Modo de Pool:** `POOL_MODE: transaction` (reutilización ultra eficiente de procesos de Postgres a nivel de transacción individual).
* **Autenticación:** `AUTH_TYPE: scram-sha-256` compatible con el cifrado moderno de PostgreSQL 16.
* **Capacidad:** `MAX_CLIENT_CONN: 150`, limitando las conexiones al backend a un `DEFAULT_POOL_SIZE: 25`, evitando el agotamiento de memoria del servidor ante picos de tráfico.
* **Prueba de conexión:**
  ```bash
  psql -h localhost -p 6432 -U postgres -d postgres -c "SELECT 1 AS pgbouncer_ok;"
  -- Resultado: 1 (Conexión fluida)
  ```

---

## 5. Read/Write Splitting en Sequelize (`config/database.js`)
Configuración declarativa de dos canales independientes:
* **Canal de Escritura (`write`):** Apunta al nodo primario (o a través de PgBouncer en el puerto 6432).
* **Canal de Lectura (`read`):** Dirige automáticamente todos los `findAll()`, `findOne()` y consultas de catálogo a la réplica en el puerto 5433, desacoplando el tráfico analítico del transaccional.

---

## 6. Pruebas de Fuego y Tolerancia a Fallos (Evidencia Práctica)

### A. Prueba de Replicación en Caliente:
1. Inserción de tupla en Primario:
   ```sql
   INSERT INTO libros (title, isbn, author, description, category, "bookCover", score, editorial, language, "publicationDate")
   VALUES ('Libro Replicado Streaming', 'REP-999', 'Bruno DBA Lead', 'Demostracion de replicacion fisica', 'FICTION', 'https://covers.openlibrary.org/b/id/1-M.jpg', 5.0, 'HIA Ediciones', 'SPA', '2026-11-13');
   ```
2. Consulta inmediata en la Réplica (Puerto 5433):
   ```sql
   SELECT id, title, isbn, author FROM libros WHERE isbn = 'REP-999';
   -- Resultado: Tupla visible de forma instantánea sin demora perceptible.
   ```

### B. Prueba de Bloqueo de Escritura en Standby:
* Intento de borrado directo en la Réplica:
  ```sql
  DELETE FROM libros WHERE isbn = 'REP-999';
  ```
* **Respuesta de PostgreSQL:**  
  `ERROR: cannot execute DELETE in a read-only transaction` (Demostración de inmutabilidad del nodo réplica).

### C. Prueba de Fallo (Failover) y Limitaciones:
* **Escenario de Caída Simulada:** Se detuvo el contenedor primario con `docker stop rayuela-db-primary`.
* **Comportamiento Observado:**
  1. La réplica (`rayuela-db-replica`) continuó atendiendo todas las solicitudes `SELECT` de lectura sin degradación ni pérdida de datos.
  2. Las operaciones de escritura entrantes quedaron bloqueadas temporalmente hasta la reactivación del primario (`docker start rayuela-db-primary`).
* **Limitación identificada y mejora futura:** En esta arquitectura de replicación física streaming con 1 standby, la conmutación a primario ante fallo definitivo se realiza mediante promoción manual (`pg_promote()`) o conmutación orquestada por proxy. Para failover 100% desatendido en producción se recomienda incorporar un orquestador distribuido como Patroni + etcd.
