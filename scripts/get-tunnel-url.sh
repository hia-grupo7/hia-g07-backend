#!/bin/bash
# =============================================================================
# get-tunnel-url.sh — Obtener URL pública de Cloudflare Tunnel
# CARD-15: Publicación Segura en Internet con Cloudflare Tunnel y HTTPS
#
# Uso:
#   bash scripts/get-tunnel-url.sh
# =============================================================================

CONTAINER_NAME="rayuela-tunnel"

echo ""
echo "============================================================"
echo "  🌐 OBTENIENDO URL PÚBLICA DE RAYUELA EN INTERNET"
echo "============================================================"
echo ""

if [ -z "$(docker ps -q -f name=$CONTAINER_NAME -f status=running)" ]; then
    echo "[ERROR] El contenedor '$CONTAINER_NAME' no está corriendo."
    echo "Inicia el stack con: docker compose --profile blue up -d"
    exit 1
fi

URL=$(docker logs $CONTAINER_NAME 2>&1 | grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' | tail -n 1)

if [ -n "$URL" ]; then
    echo "[OK] Túnel Cloudflare activo y conectado a Internet!"
    echo ""
    echo "  🔗 URL Pública (HTTPS): $URL"
    echo "  🩺 Healthcheck:         $URL/api/health"
    echo ""
    echo "Podés abrir esta URL desde tu celular o cualquier navegador del mundo."
else
    echo "[WARN] Conectando túnel... reintenta en unos segundos."
fi
echo "============================================================"
echo ""
