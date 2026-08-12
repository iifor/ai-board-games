# syntax=docker/dockerfile:1.7
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
RUN pnpm --filter @ai-presenter/server deploy --prod /opt/server-ops

# --- Stage 2: Build application from the independently verified candidate context ---
FROM node:20-slim AS runtime-builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

COPY --from=application_source package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY --from=application_source packages/shared ./packages/shared
COPY --from=application_source packages/client ./packages/client
COPY --from=application_source packages/admin ./packages/admin
COPY --from=application_source packages/server ./packages/server
COPY --from=application_source packages/db-migrator/package.json ./packages/db-migrator/package.json
COPY scripts/ops/postgres/application-input-manifest.cjs /usr/local/bin/application-input-manifest.cjs

ARG RELEASE_CANDIDATE_SHA=unbound
RUN node /usr/local/bin/application-input-manifest.cjs /app "$RELEASE_CANDIDATE_SHA" \
    > /app/.consensus-application-inputs.json

RUN pnpm install --frozen-lockfile \
    && pnpm run build:shared \
    && pnpm --filter @ai-presenter/server run build \
    && pnpm run build:client \
    && pnpm run build:admin

# --- Stage 3: Production runtime ---
FROM node:20-slim AS runtime

ARG RELEASE_CANDIDATE_SHA=unbound
ARG REVIEWED_TOOLING_HEAD=unbound
LABEL org.opencontainers.image.revision="${REVIEWED_TOOLING_HEAD}" \
      org.consensus.application-candidate="${RELEASE_CANDIDATE_SHA}" \
      org.consensus.image-role="runtime"

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# The runtime application is copied only from the independently verified
# application_source context. The start wrapper is the sole tooling overlay.
COPY --from=application_source package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY --from=application_source packages/shared ./packages/shared
COPY --from=application_source packages/client ./packages/client
COPY --from=application_source packages/admin ./packages/admin
COPY --from=application_source packages/server ./packages/server

# Copy server source (runs from TS via dev-runtime.cjs)
COPY scripts/ops/postgres/start-production-app.cjs ./scripts/ops/postgres/start-production-app.cjs

# Production deps only. Installing after source copy also guarantees that
# workspace links point at the final package directories.
RUN pnpm install --frozen-lockfile --prod --filter @ai-presenter/server...

COPY --from=runtime-builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=runtime-builder /app/.consensus-application-inputs.json ./.consensus-application-inputs.json

# Copy built static assets from builder
COPY --from=runtime-builder /app/dist ./dist

# Expose server port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/toc/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Start server
CMD ["node", "scripts/ops/postgres/start-production-app.cjs"]

# --- Stage 4: Offline migration operations ---
FROM node:20-slim AS ops

ARG RELEASE_CANDIDATE_SHA=unbound
ARG REVIEWED_TOOLING_HEAD=unbound
LABEL org.opencontainers.image.revision="${REVIEWED_TOOLING_HEAD}" \
      org.consensus.application-candidate="${RELEASE_CANDIDATE_SHA}" \
      org.consensus.image-role="ops"

WORKDIR /app

COPY --from=builder /opt/db-migrator ./packages/db-migrator
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /opt/server-ops/node_modules ./packages/server/node_modules
COPY scripts/ops/postgres/run-production-migrator.cjs ./scripts/ops/postgres/run-production-migrator.cjs

ENTRYPOINT ["node", "scripts/ops/postgres/run-production-migrator.cjs"]
CMD []
