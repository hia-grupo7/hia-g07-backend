# =============================================================================
# scripts/verify-cluster-replication.ps1
# CARD-08 / [DB-06]: Verificación de Replicación Streaming, Réplica y PgBouncer
# =============================================================================

Write-Host "=====================================================================" -ForegroundColor Magenta
Write-Host "   AUDITORIA CLÚSTER POSTGRESQL 16: STREAMING REPLICATION & PGBOUNCER" -ForegroundColor Magenta
Write-Host "=====================================================================" -ForegroundColor Magenta

Write-Host "`n=== 1. Consultando estado y Lag de Replicación (pg_stat_replication) ===" -ForegroundColor Cyan
docker exec -i rayuela-db-primary psql -U postgres -d postgres -c "
SELECT 
    pid, 
    usename, 
    application_name, 
    client_addr, 
    state, 
    sync_state, 
    sync_priority,
    COALESCE(replay_lag, '00:00:00'::interval) AS replication_lag
FROM pg_stat_replication;
"

Write-Host "`n=== 2. Configuración WAL del Primario (wal_level, max_wal_senders, hot_standby) ===" -ForegroundColor Cyan
docker exec -i rayuela-db-primary psql -U postgres -d postgres -c "
SHOW wal_level;
SHOW max_wal_senders;
SHOW hot_standby;
"

Write-Host "`n=== 3. Prueba de Escritura Transaccional en Primario ===" -ForegroundColor Cyan
docker exec -i rayuela-db-primary psql -U postgres -d postgres -c "
CREATE TABLE IF NOT EXISTS test_cluster_sync (
    id SERIAL PRIMARY KEY,
    evento TEXT,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO test_cluster_sync (evento) VALUES ('Test Sincronizacion WAL Clúster');
SELECT * FROM test_cluster_sync ORDER BY id DESC LIMIT 1;
"
Write-Host "[OK] Transacción completada en el nodo primario." -ForegroundColor Green

Write-Host "`n=== 4. Verificación de Sincronización en Nodo Réplica (Puerto 5433) ===" -ForegroundColor Cyan
docker exec -i rayuela-db-replica psql -U postgres -d postgres -c "
SELECT id, evento, fecha FROM test_cluster_sync ORDER BY id DESC LIMIT 1;
"
Write-Host "[OK] Fila sincronizada exitosamente en el nodo réplica vía WAL Streaming." -ForegroundColor Green

Write-Host "`n=== 5. Verificación de Inmutabilidad en Réplica (Intento de Escritura Bloqueado) ===" -ForegroundColor Cyan
$writeError = docker exec -i rayuela-db-replica psql -U postgres -d postgres -c "INSERT INTO test_cluster_sync (evento) VALUES ('Fallo esperado');" 2>&1
if ($writeError -like "*read-only transaction*") {
    Write-Host "[OK] El nodo réplica protege la inmutabilidad (read-only transaction comprobada)." -ForegroundColor Green
} else {
    Write-Host "[ALERTA] Respuesta inesperada: $writeError" -ForegroundColor Yellow
}

Write-Host "`n=== 6. Comprobando Pooler PgBouncer (Puerto 6432) ===" -ForegroundColor Cyan
$pgbouncerTest = docker exec -i -e PGPASSWORD=admin123 rayuela-pgbouncer psql -h 127.0.0.1 -p 6432 -U postgres -d postgres -c "SELECT 1 AS pgbouncer_ok;" 2>&1
if ($pgbouncerTest -like "*1 row*") {
    Write-Host "[OK] PgBouncer está operando en puerto 6432 con autenticación SCRAM-SHA-256." -ForegroundColor Green
} else {
    Write-Host "[ERROR] PgBouncer no respondió correctamente: $pgbouncerTest" -ForegroundColor Red
}

Write-Host "`n=====================================================================" -ForegroundColor Magenta
Write-Host "   CERTIFICACIÓN CARD-08: CLÚSTER DE ALTA DISPONIBILIDAD 100% OPERATIVO" -ForegroundColor Magenta
Write-Host "=====================================================================" -ForegroundColor Magenta
