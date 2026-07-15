# Production Deployment Hardening Design

## Goal

Make the existing single-node Docker deployment safe to place behind a Tencent Cloud load balancer without changing product behavior, public APIs, database schemas, or shared protocols.

## Production Boundary

- Tencent Cloud load balancer terminates HTTPS and forwards HTTP/WebSocket traffic to Nginx on port 80.
- Nginx and the Node.js application remain private backend services; the CVM security group must allow port 80 only from the load balancer.
- One application container owns one SQLite database. Horizontal multi-instance deployment is out of scope.

## Runtime Image

Keep the existing TypeScript runtime to minimize change risk. Move `typescript` into the server's production dependencies and copy the built `packages/shared/dist` output from the builder stage into the runtime stage. The runtime image must be built in CI, not only the builder stage, so missing runtime files or dependencies fail before SSH deployment.

No new runtime framework or process manager is introduced.

## Authentication and Secrets

Add one focused auth configuration module that reads and validates:

- `JWT_SECRET`: required in production, at least 32 characters.
- `ADMIN_USERNAME`: required in production and non-empty.
- `ADMIN_PASSWORD`: required in production, at least 12 characters.

Production startup fails before listening when any required value is missing or weak. Development may start without administrator bootstrap values, but it must not create or reset an account from hard-coded credentials.

Administrator bootstrap uses only environment values. It disables other previously seeded administrator accounts, then inserts or rotates the configured account password using the existing MD5 transport compatibility and scrypt storage path. Passwords and JWT secrets are never logged.

`.env.example` contains placeholders only. The real `.env` remains ignored by Git and is provisioned directly on the CVM.

## Persistence

Retain the existing named volume for SQLite and add a separate named volume mounted at `/app/packages/server/resources` for uploaded images and generated audio. Keep the existing avatar bind mount.

Deployment documentation must include backup and restore commands for both named volumes. A container restart or rebuild must not remove database records or generated resources.

## Load Balancer and Proxying

Nginx continues to proxy REST, static files, the admin SPA, and WebSocket upgrades. It preserves the load balancer's `X-Forwarded-Proto` value instead of replacing it with the internal HTTP scheme. Express trusts one proxy hop.

TLS certificates, DNS, WAF, and health-check scheduling remain Tencent Cloud responsibilities. The application health check continues to use the existing unauthenticated TOC endpoint.

## Graceful Shutdown

Add a small server lifecycle helper used by the HTTP entry point. On the first `SIGTERM` or `SIGINT`, it stops accepting new connections and waits for the HTTP server to close. A 10-second unref'd timer forces a non-zero exit if open WebSocket connections prevent shutdown. Repeated signals do not start duplicate shutdown sequences.

## Deployment Flow

GitHub Actions must pass these gates before SSH deployment:

1. Type checking.
2. Full workspace build.
3. Unit tests.
4. Workflow tests.
5. Migration tests.
6. Full runtime Docker image build.

The remote deployment keeps the existing `docker compose up -d --build` flow. After deployment, Compose health status and an HTTP health request through the load balancer are the acceptance checks.

## Testing

- Auth configuration tests cover missing, weak, and valid production secrets.
- Admin bootstrap tests prove credentials come from environment-derived configuration and legacy accounts are disabled without embedding a password in source.
- Lifecycle tests prove one-shot graceful close, successful exit, close-error exit, and timeout behavior.
- Compose config validation checks volume and environment wiring.
- The complete existing check/build/unit/workflow/migration suite must remain green.
- A full Docker runtime build and container health check are required when a Docker daemon is available.

## Explicit Non-Goals

- No Kubernetes, PM2, Redis, managed database, or object storage migration.
- No application-managed TLS certificates.
- No multi-instance coordination.
- No REST, WebSocket, database schema, frontend behavior, or shared-type changes.
