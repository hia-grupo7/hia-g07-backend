# =============================================================
# Etapa 1: deps — instalar solo dependencias de producción
# =============================================================
FROM node:20-alpine AS deps

# Instalar dependencias del sistema necesarias para módulos nativos (bcryptjs, pg)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copiar manifiestos de dependencias primero (aprovecha caché de capas de Docker)
COPY package.json package-lock.json ./

# Instalar solo dependencias de producción y limpiar caché npm
RUN npm ci --omit=dev && npm cache clean --force

# =============================================================
# Etapa 2: builder — reunir código fuente con dependencias
# =============================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar dependencias ya instaladas desde etapa deps
COPY --from=deps /app/node_modules ./node_modules

# Copiar el código fuente de la aplicación
COPY . .

# =============================================================
# Etapa 3: production — imagen final mínima y segura
# =============================================================
FROM node:20-alpine AS production

# Metadatos de la imagen
LABEL maintainer="Grupo 7 HIA — Rayuela Librería Online"
LABEL version="1.0.0"
LABEL description="Backend Node.js/Express para Rayuela — imagen de producción"

WORKDIR /app

# Copiar solo los artefactos necesarios desde la etapa builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/index.js ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/swagger.js ./
COPY --from=builder /app/swagger_output.json ./
COPY --from=builder /app/src ./src
COPY --from=builder /app/config ./config

# Usar usuario no-root por seguridad (UID 1000 — usuario 'node' incluido en la imagen Alpine)
USER node

# Puerto de la aplicación Express
EXPOSE 3000

# Health check: verifica que el endpoint de salud responda correctamente
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Comando de arranque de la aplicación
CMD ["node", "index.js"]
