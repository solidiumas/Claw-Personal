# ============================================================
# Claw Personal — Orkestrator Dockerfile
# ============================================================
# Multi-stage build for produksjonsoptimalisert image.
# Basert på Node.js Alpine for minimal størrelse.
# ============================================================

# --- Build stage ---
FROM node:22-alpine AS builder

WORKDIR /app

# Kopier package-filer og installer avhengigheter
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# --- Production stage ---
FROM node:22-alpine

WORKDIR /app

# Kopier node_modules fra build stage
COPY --from=builder /app/node_modules ./node_modules

# Kopier applikasjonskode
COPY package.json ./
COPY src/ ./src/

# Kjør som ikke-root bruker for sikkerhet
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup
USER appuser

# Eksponer port
EXPOSE 3000

# Helse-sjekk
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=5s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start serveren
CMD ["node", "src/server.js"]
