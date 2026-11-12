# =============================================================================
# get-tunnel-url.ps1 — Obtener URL pública de Cloudflare Tunnel
# CARD-15: Publicación Segura en Internet con Cloudflare Tunnel y HTTPS
#
# Uso:
#   .\scripts\get-tunnel-url.ps1
# =============================================================================

$CONTAINER_NAME = "rayuela-tunnel"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  🌐 OBTENIENDO URL PÚBLICA DE RAYUELA EN INTERNET" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$running = docker ps --filter "name=$CONTAINER_NAME" --filter "status=running" --format "{{.Names}}"
if (-not $running) {
    Write-Host "[ERROR] El contenedor '$CONTAINER_NAME' no está corriendo." -ForegroundColor Red
    Write-Host "Inicia el stack con: docker compose --profile blue up -d" -ForegroundColor Yellow
    exit 1
}

$logs = docker logs $CONTAINER_NAME 2>&1
$urlMatch = $logs | Select-String -Pattern "https://[a-zA-Z0-9-]+\.trycloudflare\.com" | Select-Object -Last 1

if ($urlMatch) {
    $url = $urlMatch.Matches[0].Value
    Write-Host "[OK] Túnel Cloudflare activo y conectado a Internet!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  🔗 URL Pública (HTTPS): $url" -ForegroundColor Yellow
    Write-Host "  🩺 Healthcheck:         $url/api/health" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Podés abrir esta URL desde tu celular o cualquier navegador del mundo." -ForegroundColor White
} else {
    Write-Host "[WARN] Conectando túnel... reintenta en unos segundos." -ForegroundColor Yellow
    Write-Host "Logs recientes:"
    $logs | Select-Object -Last 5
}
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
