# Informe Técnico: Publicación Segura en Internet con Cloudflare Tunnel y HTTPS (CARD-15 / NET-01)

**Proyecto:** Rayuela — Librería Online  
**Materia:** Herramientas Informáticas Avanzadas (HIA) — Grupo 07  
**Responsable:** Responsable 1 (DevOps & Containers Lead)  
**Fecha:** 12 de Noviembre de 2026  
**Rama:** `feature/CARD-15-cloudflare-tunnel`  

---

## 1. Resumen Ejecutivo

En cumplimiento con los requerimientos de la tarjeta **[Sprint 3] [NET-01] Publicación Segura en Internet con Cloudflare Tunnel y HTTPS (CARD-15)**, se implementó la exposición pública y segura de la aplicación web Rayuela mediante la tecnología de **Cloudflare Tunnel (Argo Tunnel / Quick Tunnel)**.

Esta arquitectura permite que tanto el frontend (SPA Angular 22) como el backend (API REST Node/Express) sean accesibles desde cualquier navegador o dispositivo móvil conectado a Internet bajo un protocolo cifrado **HTTPS con certificado TLS emitido por Cloudflare**, **sin necesidad de abrir puertos entrantes en el enrutador/módem residencial, sin requerir una IP pública fija y manteniendo la base de datos PostgreSQL 100% aislada de Internet**.

---

## 2. Arquitectura de Publicación y Flujo de Tráfico

```
[ Cliente en Internet ] (Móvil / PC remota)
          │
          │ HTTPS (TLS 1.3 / Puerto 443)
          ▼
┌────────────────────────────────────────┐
│  Cloudflare Edge Network (Global CDN)  │
│  - Certificado SSL/TLS gestionado      │
│  - Mitigación DDoS y Web Application   │
└──────────────────┬─────────────────────┘
                   │
                   │ Túnel Saliente Encriptado (Protocolo QUIC)
                   ▼
┌────────────────────────────────────────┐
│   Contenedor: rayuela-tunnel           │
│   (cloudflare/cloudflared:latest)      │
└──────────────────┬─────────────────────┘
                   │ HTTP (Red interna Docker: rayuela-network)
                   ▼
┌────────────────────────────────────────┐
│   Contenedor: rayuela-nginx-proxy      │
│   (Proxy Inverso Nginx / Puerto 80)    │
└─────────┬────────────────────┬─────────┘
          │                    │
          ▼                    ▼
┌──────────────────┐   ┌────────────────────────┐
│ rayuela-frontend │   │  rayuela-backend-blue  │
│ (Angular 22 SPA) │   │  (Slot activo / 3000)  │
└──────────────────┘   └───────────┬────────────┘
                                   │ Red interna (5432)
                                   ▼
                       ┌────────────────────────┐
                       │   rayuela-db-primary   │
                       │ (PostgreSQL 16 - AISLADA)
                       └────────────────────────┘
```

---

## 3. Configuración en `compose.yaml`

### 3.1. Servicio `cloudflared`
Se integró el servicio oficial de Cloudflare como parte del orquestador:

```yaml
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: rayuela-tunnel
    restart: unless-stopped
    command: >-
      tunnel
      --no-autoupdate
      --url http://nginx-proxy:80
    networks:
      - rayuela-network
    depends_on:
      nginx-proxy:
        condition: service_healthy
```

### 3.2. Aislamiento Estricto de PostgreSQL (Hardening de Seguridad)
Para cumplir con el criterio de aceptación que exige que el motor de base de datos **no quede expuesto a Internet**, se removió la publicación de puertos hacia interfaces públicas (`0.0.0.0`), definiendo el puerto de PostgreSQL como exclusivamente interno mediante directiva `expose`:

```yaml
  postgres-primary:
    image: postgres:16-alpine
    container_name: rayuela-db-primary
    ...
    networks:
      - rayuela-network
    expose:
      - "5432"
```

Evidencia en `docker ps`:
```text
rayuela-db-primary      Up (healthy)            5432/tcp (SIN mapeo de puertos hacia el host)
```

---

## 4. Scripts de Automatización Creados

Para facilitar la consulta de la URL generada en cualquier entorno, se crearon dos scripts:
- **`scripts/get-tunnel-url.ps1`** (Windows PowerShell)
- **`scripts/get-tunnel-url.sh`** (Linux / macOS / Bash)

Ambos inspeccionan la salida del contenedor en ejecución y extraen la URL pública HTTPS activa.

---

## 5. Pruebas de Validación y Certificación

1. **Conectividad HTTPS Pública:**
   - URL del túnel: `https://date-tampa-explains-data.trycloudflare.com`
   - Código de respuesta HTTP raíz `/`: `200 OK` (sirviendo la interfaz SPA de Rayuela).
2. **Healthcheck en Vivo:**
   - Endpoint: `https://date-tampa-explains-data.trycloudflare.com/api/health`
   - Respuesta:
     ```json
     {
       "status": "ok",
       "servicio": "rayuela-backend",
       "baseDeDatos": "conectada",
       "uptimeSegundos": 4307,
       "timestamp": "2026-11-12T21:56:32.344Z"
     }
     ```
3. **Inspección de Certificado TLS:**
   - **Emisor:** `CN=WE1, O=Google Trust Services, C=US`
   - **Sujeto:** `CN=trycloudflare.com`
   - **Cifrado:** TLS 1.3 con curva X25519MLKEM768 / P-256.
4. **Verificación de Seguridad:**
   - El puerto 5432 se encuentra completamente restringido a la red interna `rayuela-network`. No existe vector de ataque directo hacia la base de datos desde el túnel ni desde el exterior.
