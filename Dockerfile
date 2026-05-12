# syntax=docker/dockerfile:1.7
# ============================================================================
# ARQCdR // Azure-ready container image
# ============================================================================

# ---- Build stage --------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# Install deps with the full devDependencies so vite/esbuild/tsc are available.
COPY package*.json ./
RUN npm ci --no-audit --no-fund

# Build the SPA + server bundle.
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY server-azure.ts ./
RUN npm run build

# ---- Runtime stage ------------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

# Install production-only deps. The server bundle externalizes @azure/*,
# openai, jwks-rsa, jsonwebtoken, express, and vite so they must be present.
COPY package*.json ./
RUN npm ci --no-audit --no-fund --omit=dev

# Bundled server + built SPA.
COPY --from=builder /app/dist ./dist

# Drop privileges.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health',r=>{if(r.statusCode!==200)process.exit(1)}).on('error',()=>process.exit(1))"

CMD ["node", "dist/server.cjs"]
