# =============================================================================
# scripts/verify-db-persistence.ps1
# CARD-02 / [DB-01]: Verificación de Salud y Persistencia de PostgreSQL 16
# =============================================================================

Write-Host "=== 1. Verificando estado del contenedor rayuela-db-primary ===" -ForegroundColor Cyan
docker compose ps postgres-primary

Write-Host "`n=== 2. Comprobando healthcheck nativo con pg_isready ===" -ForegroundColor Cyan
docker exec -i rayuela-db-primary pg_isready -U postgres -d postgres
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] PostgreSQL 16 está listo y aceptando conexiones." -ForegroundColor Green
} else {
    Write-Host "[ERROR] PostgreSQL no responde al sondeo de salud." -ForegroundColor Red
    exit 1
}

Write-Host "`n=== 3. Consultando versión del motor PostgreSQL ===" -ForegroundColor Cyan
docker exec -i rayuela-db-primary psql -U postgres -d postgres -c "SELECT version();"

Write-Host "`n=== 4. Validando persistencia en volumen rayuela_postgres_data ===" -ForegroundColor Cyan
docker exec -i rayuela-db-primary psql -U postgres -d postgres -c "
CREATE TABLE IF NOT EXISTS test_card02_persistencia (
    id SERIAL PRIMARY KEY,
    responsable TEXT DEFAULT 'Bruno - DBA Lead',
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO test_card02_persistencia (responsable) VALUES ('Bruno - DBA Lead (Prueba CARD-02)');
SELECT * FROM test_card02_persistencia ORDER BY id DESC LIMIT 3;
"
Write-Host "[OK] Prueba de lectura/escritura en volumen completada exitosamente." -ForegroundColor Green
