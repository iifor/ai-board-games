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
COPY packages/db-migrator/package.json packages/db-migrator/package.json

# Install all deps (--frozen-lockfile for reproducible builds)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Re-link workspace package dependencies after the source copy. On Windows
# build contexts, package-level node_modules junctions may otherwise mask the
# links created by the manifest-only install layer.
RUN pnpm install --frozen-lockfile --offline

# Build order: shared → client → admin (server runs from TS at runtime)
RUN pnpm run build:shared \
    && pnpm --filter @ai-presenter/server run build \
    && pnpm --filter @ai-presenter/db-migrator run build \
    && pnpm run build:client \
    && pnpm run build:admin

# The db-migrator bundle is deliberately created apart from the runtime image.
# It contains one-time SQLite tooling and is copied only into the ops image.
RUN pnpm --filter @ai-presenter/db-migrator deploy --prod /opt/db-migrator

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

# Copy server source (runs from TS via dev-runtime.cjs)
COPY packages/server ./packages/server
COPY packages/shared ./packages/shared
COPY scripts/ops/postgres/start-production-app.cjs ./scripts/ops/postgres/start-production-app.cjs

# Production deps only. Installing after source copy also guarantees that
# workspace links point at the final package directories.
RUN pnpm install --frozen-lockfile --prod --filter @ai-presenter/server...

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# Copy built static assets from builder
COPY --from=builder /app/dist ./dist

# Expose server port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/toc/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Start server
CMD ["node", "scripts/ops/postgres/start-production-app.cjs"]

# --- Stage 3: Offline migration operations ---
FROM node:20-slim AS ops

WORKDIR /app

COPY --from=builder /opt/db-migrator ./packages/db-migrator
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY scripts/ops/postgres/run-production-migrator.cjs ./scripts/ops/postgres/run-production-migrator.cjs

ENTRYPOINT ["node", "scripts/ops/postgres/run-production-migrator.cjs"]
CMD []
