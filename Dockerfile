# ============================================================
# CONSENSUS — Multi-stage Dockerfile
# ============================================================
# Stage 1: Install dependencies + build all packages
# Stage 2: Production runtime (server + built static assets)
# ============================================================

# --- Stage 1: Build ---
FROM node:20-slim AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace manifests first for better layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json  packages/shared/package.json
COPY packages/client/package.json  packages/client/package.json
COPY packages/admin/package.json   packages/admin/package.json
COPY packages/server/package.json  packages/server/package.json

# Install all deps (--frozen-lockfile for reproducible builds)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build order: shared → client → admin (server runs from TS at runtime)
RUN pnpm run build:shared \
    && pnpm run build:client \
    && pnpm run build:admin

# --- Stage 2: Production runtime ---
FROM node:20-slim AS runtime

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json  packages/shared/package.json
COPY packages/client/package.json  packages/client/package.json
COPY packages/admin/package.json   packages/admin/package.json
COPY packages/server/package.json  packages/server/package.json

# Production deps only (--prod not needed since pnpm filters by workspace)
RUN pnpm install --frozen-lockfile --prod

# Copy server source (runs from TS via dev-runtime.cjs)
COPY packages/server ./packages/server
COPY packages/shared ./packages/shared

# Copy built static assets from builder
COPY --from=builder /app/dist ./dist

# Copy data directory template (SQLite DB will be mounted as volume)
RUN mkdir -p /app/data

# Expose server port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/toc/games').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Start server
CMD ["node", "--preserve-symlinks", "--preserve-symlinks-main", "packages/server/dev-runtime.cjs"]
