#!/bin/bash
# =============================================================================
# switch-bluegreen.sh — Conmutación Zero-Downtime Blue/Green
# CARD-10: Orquestación Docker Compose y Blue/Green Deployment
#
# Uso:
#   bash scripts/switch-bluegreen.sh blue    # Activar slot Blue
#   bash scripts/switch-bluegreen.sh green   # Activar slot Green
#
# Requisitos:
#   - Docker Compose v2+
#   - Ambas imágenes (rayuela-backend:1.0.0, rayuela-frontend:1.0.0) buildeadas
#   - compose.yaml en el directorio actual
# =============================================================================

set -euo pipefail

SLOT_DESTINO="${1:-}"
CONF_NGINX="./nginx/conf.d/default.conf"
HEALTH_URL_BLUE="http://localhost:3000/api/health"
HEALTH_URL_GREEN="http://localhost:3000/api/health"
MAX_INTENTOS=12
INTERVALO=5

# --- Colores para output legible ---
VERDE='\033[0;32m'
ROJO='\033[0;31m'
AMARILLO='\033[1;33m'
AZUL='\033[0;34m'
NC='\033[0m' # Sin color

log()  { echo -e "${AZUL}[INFO]${NC}  $*"; }
ok()   { echo -e "${VERDE}[OK]${NC}    $*"; }
warn() { echo -e "${AMARILLO}[WARN]${NC}  $*"; }
err()  { echo -e "${ROJO}[ERROR]${NC} $*"; exit 1; }

# --- Validación de argumento ---
if [[ "$SLOT_DESTINO" != "blue" && "$SLOT_DESTINO" != "green" ]]; then
    err "Uso: $0 [blue|green]"
fi

if [[ "$SLOT_DESTINO" == "blue" ]]; then
    SLOT_ORIGEN="green"
    CONTAINER_DESTINO="rayuela-backend-blue"
    CONTAINER_ORIGEN="rayuela-backend-green"
    PERFIL_DESTINO="blue"
    PERFIL_ORIGEN="green"
    SERVIDOR_UPSTREAM="backend-blue:3000"
else
    SLOT_ORIGEN="blue"
    CONTAINER_DESTINO="rayuela-backend-green"
    CONTAINER_ORIGEN="rayuela-backend-blue"
    PERFIL_DESTINO="green"
    PERFIL_ORIGEN="blue"
    SERVIDOR_UPSTREAM="backend-green:3000"
fi

echo ""
echo "============================================================"
echo "  🚀 CONMUTACIÓN BLUE/GREEN — Activando slot: $SLOT_DESTINO"
echo "============================================================"
echo ""

# --- PASO 1: Levantar el slot destino ---
log "PASO 1: Levantando slot '$SLOT_DESTINO' (contenedor: $CONTAINER_DESTINO)..."
docker compose --profile "$PERFIL_DESTINO" up -d

# --- PASO 2: Esperar que el slot destino esté healthy ---
log "PASO 2: Esperando que '$CONTAINER_DESTINO' pase el healthcheck..."

INTENTOS=0
while true; do
    ESTADO=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_DESTINO" 2>/dev/null || echo "no-existe")
    
    if [[ "$ESTADO" == "healthy" ]]; then
        ok "Slot '$SLOT_DESTINO' está HEALTHY ✓"
        break
    fi

    INTENTOS=$((INTENTOS + 1))
    if [[ $INTENTOS -ge $MAX_INTENTOS ]]; then
        err "El slot '$SLOT_DESTINO' no pasó el healthcheck después de $((MAX_INTENTOS * INTERVALO))s. Abortando sin cortar servicio."
    fi

    warn "Estado actual: '$ESTADO'. Reintento $INTENTOS/$MAX_INTENTOS en ${INTERVALO}s..."
    sleep $INTERVALO
done

# --- PASO 3: Actualizar configuración de Nginx (upstream activo) ---
log "PASO 3: Actualizando upstream de Nginx → $SERVIDOR_UPSTREAM..."

# Reemplaza la línea del server en el upstream backend-activo
sed -i "s|server backend-.*:3000;|server $SERVIDOR_UPSTREAM;|g" "$CONF_NGINX"

# Verificar que el cambio fue efectivo
if grep -q "server $SERVIDOR_UPSTREAM;" "$CONF_NGINX"; then
    ok "Configuración Nginx actualizada: upstream → $SERVIDOR_UPSTREAM"
else
    err "No se pudo actualizar el upstream en $CONF_NGINX"
fi

# --- PASO 4: Recargar Nginx sin cortar conexiones existentes ---
log "PASO 4: Recargando Nginx (nginx -s reload — sin corte de servicio)..."
docker exec rayuela-nginx-proxy nginx -s reload
ok "Nginx recargado exitosamente ✓"

# --- PASO 5: Verificar que el proxy enruta correctamente ---
log "PASO 5: Verificando que el proxy responde correctamente..."
sleep 2

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/api/health 2>/dev/null || echo "000")
if [[ "$HTTP_CODE" == "200" ]]; then
    ok "Proxy responde 200 OK en /api/health ✓"
else
    warn "El proxy respondió código $HTTP_CODE. Verificar manualmente: curl http://localhost/api/health"
fi

# --- PASO 6: Detener el slot origen (opcional, con confirmación) ---
echo ""
read -r -p "¿Detener el slot '$SLOT_ORIGEN' ($CONTAINER_ORIGEN)? [s/N]: " CONFIRMAR
if [[ "$CONFIRMAR" =~ ^[sS]$ ]]; then
    log "PASO 6: Deteniendo slot '$SLOT_ORIGEN'..."
    docker compose --profile "$PERFIL_ORIGEN" stop
    ok "Slot '$SLOT_ORIGEN' detenido. El tráfico sigue fluyendo por '$SLOT_DESTINO'."
else
    log "Slot '$SLOT_ORIGEN' mantenido activo (modo warm standby)."
fi

# --- Resumen Final ---
echo ""
echo "============================================================"
ok "✅ CONMUTACIÓN COMPLETADA"
echo "   Slot activo:   $SLOT_DESTINO ($CONTAINER_DESTINO)"
echo "   Upstream Nginx: $SERVIDOR_UPSTREAM"
echo "   Frontend:       http://localhost"
echo "   API Health:     http://localhost/api/health"
echo "   pgAdmin:        http://localhost:5050"
echo "============================================================"
echo ""
