# =============================================================================
# switch-bluegreen.ps1 — Conmutación Zero-Downtime Blue/Green (Windows)
# CARD-10: Orquestación Docker Compose y Blue/Green Deployment
#
# Uso:
#   .\scripts\switch-bluegreen.ps1 blue    # Activar slot Blue
#   .\scripts\switch-bluegreen.ps1 green   # Activar slot Green
# =============================================================================

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("blue","green")]
    [string]$SlotDestino
)

$ErrorActionPreference = "Stop"

$CONF_NGINX   = ".\nginx\conf.d\default.conf"
$MAX_INTENTOS = 12
$INTERVALO    = 5

# Mapeo de slots
if ($SlotDestino -eq "blue") {
    $SlotOrigen        = "green"
    $ContainerDestino  = "rayuela-backend-blue"
    $ContainerOrigen   = "rayuela-backend-green"
    $PerfilDestino     = "blue"
    $PerfilOrigen      = "green"
    $ServidorUpstream  = "backend-blue:3000"
} else {
    $SlotOrigen        = "blue"
    $ContainerDestino  = "rayuela-backend-green"
    $ContainerOrigen   = "rayuela-backend-blue"
    $PerfilDestino     = "green"
    $PerfilOrigen      = "blue"
    $ServidorUpstream  = "backend-green:3000"
}

function Log  { param($msg) Write-Host "[INFO]  $msg" -ForegroundColor Cyan }
function Ok   { param($msg) Write-Host "[OK]    $msg" -ForegroundColor Green }
function Warn { param($msg) Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Err  { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  CONMUTACION BLUE/GREEN — Activando slot: $SlotDestino" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# --- PASO 1: Levantar slot destino ---
Log "PASO 1: Levantando slot '$SlotDestino' (contenedor: $ContainerDestino)..."
docker compose --profile $PerfilDestino up -d
if ($LASTEXITCODE -ne 0) { Err "Fallo al levantar el slot '$SlotDestino'" }

# --- PASO 2: Esperar healthcheck ---
Log "PASO 2: Esperando que '$ContainerDestino' pase el healthcheck..."

$intentos = 0
while ($true) {
    $estado = docker inspect --format="{{.State.Health.Status}}" $ContainerDestino 2>$null
    if ($estado -eq "healthy") {
        Ok "Slot '$SlotDestino' esta HEALTHY ✓"
        break
    }
    $intentos++
    if ($intentos -ge $MAX_INTENTOS) {
        Err "El slot '$SlotDestino' no paso el healthcheck despues de $($MAX_INTENTOS * $INTERVALO)s. Abortando."
    }
    Warn "Estado actual: '$estado'. Reintento $intentos/$MAX_INTENTOS en ${INTERVALO}s..."
    Start-Sleep -Seconds $INTERVALO
}

# --- PASO 3: Actualizar configuración Nginx ---
Log "PASO 3: Actualizando upstream de Nginx → $ServidorUpstream..."

$contenido = Get-Content $CONF_NGINX -Raw
$contenidoNuevo = $contenido -replace "server backend-(blue|green):3000;", "server $ServidorUpstream;"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$rutaCompleta = (Resolve-Path $CONF_NGINX).Path
[System.IO.File]::WriteAllText($rutaCompleta, $contenidoNuevo, $utf8NoBom)

if (Select-String -Path $CONF_NGINX -Pattern "server $ServidorUpstream;" -Quiet) {
    Ok "Configuracion Nginx actualizada: upstream → $ServidorUpstream"
} else {
    Err "No se pudo actualizar el upstream en $CONF_NGINX"
}

# --- PASO 4: Recargar Nginx ---
Log "PASO 4: Recargando Nginx (sin corte de servicio)..."
docker exec rayuela-nginx-proxy nginx -s reload
if ($LASTEXITCODE -ne 0) { Err "Fallo al recargar Nginx" }
Ok "Nginx recargado exitosamente ✓"

# --- PASO 5: Verificar proxy ---
Log "PASO 5: Verificando que el proxy responde..."
Start-Sleep -Seconds 2

try {
    $resp = Invoke-WebRequest -Uri "http://localhost/api/health" -TimeoutSec 5 -UseBasicParsing
    if ($resp.StatusCode -eq 200) {
        Ok "Proxy responde 200 OK en /api/health ✓"
    }
} catch {
    Warn "No se pudo verificar /api/health. Verificar manualmente."
}

# --- PASO 6: Detener slot origen ---
Write-Host ""
$confirmar = Read-Host "Detener el slot '$SlotOrigen' ($ContainerOrigen)? [s/N]"
if ($confirmar -match "^[sS]$") {
    Log "PASO 6: Deteniendo slot '$SlotOrigen'..."
    docker compose --profile $PerfilOrigen stop
    Ok "Slot '$SlotOrigen' detenido. Trafico fluyendo por '$SlotDestino'."
} else {
    Log "Slot '$SlotOrigen' mantenido activo (modo warm standby)."
}

# --- Resumen ---
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Ok "CONMUTACION COMPLETADA"
Write-Host "   Slot activo:    $SlotDestino ($ContainerDestino)" -ForegroundColor White
Write-Host "   Upstream Nginx: $ServidorUpstream" -ForegroundColor White
Write-Host "   Frontend:       http://localhost" -ForegroundColor White
Write-Host "   API Health:     http://localhost/api/health" -ForegroundColor White
Write-Host "   pgAdmin:        http://localhost:5050" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
