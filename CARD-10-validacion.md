# Validación Stack CARD-10 — 2026-11-12 17:49:41

## docker compose --profile blue up -d
Stack levantado exitosamente con perfil blue.

## docker ps (todos healthy)
| Contenedor          | Estado   | Puerto |
|---------------------|----------|--------|
| rayuela-nginx-proxy | healthy  | 80     |
| rayuela-frontend    | healthy  | -      |
| rayuela-backend-blue| healthy  | -      |
| rayuela-db-primary  | healthy  | 5432   |
| rayuela-pgadmin     | healthy  | 5050   |

## Verificación de endpoints
- GET http://localhost/api/health → 200 OK
  Response: {"status":"ok","servicio":"rayuela-backend","baseDeDatos":"conectada","uptimeSegundos":166}
- GET http://localhost/ → 200 OK (Angular SPA)
- GET http://localhost/health-proxy → 200 OK (Nginx proxy-ok)

## Conmutación Blue/Green
Script: scripts/switch-bluegreen.ps1
- Levanta slot destino
- Verifica healthcheck
- Actualiza upstream en nginx/conf.d/default.conf
- Recarga Nginx sin corte: docker exec rayuela-nginx-proxy nginx -s reload
