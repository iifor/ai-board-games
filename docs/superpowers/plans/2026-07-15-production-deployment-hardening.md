# Production Deployment Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a safe, single-node Docker release candidate that runs behind a Tencent Cloud HTTPS load balancer.

**Architecture:** Keep the existing Node.js/TypeScript runtime, SQLite database, Docker Compose, Nginx, and GitHub Actions flow. Add fail-fast production auth configuration, environment-driven admin bootstrap, persistent generated resources, one-proxy awareness, graceful shutdown, and full runtime-image validation without changing public APIs or database schemas.

**Tech Stack:** Node.js 20, TypeScript 6, Express 4, better-sqlite3, pnpm 9, Docker Compose, Nginx, GitHub Actions.

## Global Constraints

- Tencent Cloud load balancer terminates HTTPS; application containers remain HTTP-only.
- Keep one application instance backed by SQLite; no horizontal scaling work.
- Add no new dependency, public API, database migration, frontend behavior, or shared type.
- Preserve all existing dirty-worktree changes. `docs/project-server.md` already has user edits, so do not stage that whole file.
- Use `pnpm.cmd` in PowerShell.

---

### Task 1: Fail-fast production authentication configuration

**Files:**
- Create: `packages/server/modules/auth/config.ts`
- Create: `tests/unit/authProductionConfig.test.ts`
- Modify: `packages/server/modules/auth/service.ts`
- Modify: `packages/server/modules/auth/index.ts`
- Modify: `packages/server/app.ts`
- Modify: `tests/unit/runUnitTests.cjs`
- Modify: `.env.example`

**Interfaces:**
- Produces: `readAuthConfig(env?: NodeJS.ProcessEnv): AuthConfig`
- Produces: `seedAdminUser(db: Database, admin: AdminBootstrapConfig | null): void`
- Consumes: existing `hashPasswordSync`, `verifyPassword`, migrations, and admin login flow.

- [ ] **Step 1: Write failing auth configuration tests**

Add `authProductionConfig.test.ts` with Node's test runner. Cover these exact cases:

```ts
test('production auth rejects missing JWT secret', () => {
  assert.throws(() => readAuthConfig({
    NODE_ENV: 'production',
    ADMIN_USERNAME: 'release-admin',
    ADMIN_PASSWORD: 'a-secure-password',
  }), /JWT_SECRET/);
});

test('production auth rejects weak credentials', () => {
  assert.throws(() => readAuthConfig({
    NODE_ENV: 'production',
    JWT_SECRET: 'short',
    ADMIN_USERNAME: 'release-admin',
    ADMIN_PASSWORD: 'short',
  }), /JWT_SECRET|ADMIN_PASSWORD/);
});

test('production auth accepts complete strong credentials', () => {
  const config = readAuthConfig({
    NODE_ENV: 'production',
    JWT_SECRET: '0123456789abcdef0123456789abcdef',
    ADMIN_USERNAME: 'release-admin',
    ADMIN_PASSWORD: 'a-secure-password',
  });
  assert.equal(config.admin?.username, 'release-admin');
});

test('development auth does not invent an administrator', () => {
  assert.equal(readAuthConfig({ NODE_ENV: 'development' }).admin, null);
});
```

Register the file in `runUnitTests.cjs`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
pnpm.cmd run test:unit -- authProductionConfig.test.ts
```

Expected: FAIL because `modules/auth/config.ts` does not exist.

- [ ] **Step 3: Implement minimal auth configuration**

Create `config.ts` with one configuration boundary:

```ts
interface AdminBootstrapConfig {
  username: string;
  password: string;
}

interface AuthConfig {
  jwtSecret: string;
  admin: AdminBootstrapConfig | null;
}

function readAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const production = env.NODE_ENV === 'production';
  const jwtSecret = String(env.JWT_SECRET || '').trim();
  const username = String(env.ADMIN_USERNAME || '').trim();
  const password = String(env.ADMIN_PASSWORD || '');

  if (production && jwtSecret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters in production.');
  if (production && !username) throw new Error('ADMIN_USERNAME is required in production.');
  if (production && password.length < 12) throw new Error('ADMIN_PASSWORD must contain at least 12 characters in production.');
  if (!production && Boolean(username) !== Boolean(password)) throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD must be configured together.');

  return {
    jwtSecret: jwtSecret || 'development-only-jwt-secret',
    admin: username && password ? { username, password } : null,
  };
}
```

Change `service.ts` so token signing and verification call `readAuthConfig().jwtSecret`; remove the fixed production-capable secret constant.

Call `readAuthConfig()` at the beginning of `createApp()`, pass `config.admin` into `seedData`, and set `app.set('trust proxy', 1)`.

- [ ] **Step 4: Add failing administrator bootstrap test**

Use an in-memory `better-sqlite3` database and existing `migrate()`:

```ts
test('admin bootstrap disables legacy accounts and uses configured credentials', async () => {
  const db = new Database(':memory:');
  migrate(db);
  db.prepare("INSERT INTO admin_users (username, password_hash) VALUES ('admin', 'legacy'), ('ifor', 'legacy')").run();

  seedAdminUser(db, { username: 'release-admin', password: 'a-secure-password' });

  const rows = db.prepare('SELECT username, password_hash, enabled FROM admin_users ORDER BY username').all() as Array<Record<string, unknown>>;
  assert.deepEqual(rows.filter((row) => row.enabled === 1).map((row) => row.username), ['release-admin']);
  const current = rows.find((row) => row.username === 'release-admin')!;
  assert.equal(await verifyPassword(md5('a-secure-password'), String(current.password_hash)), true);
  db.close();
});
```

Expected before implementation: FAIL because `seedAdminUser` does not accept configured credentials and still embeds a password.

- [ ] **Step 5: Replace hard-coded administrator bootstrap**

Change `seedAdminUser` to return immediately when `admin` is null. Otherwise:

```ts
db.prepare('UPDATE admin_users SET enabled = 0 WHERE username <> ?').run(admin.username);
const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(admin.username) as { id: number } | undefined;
const passwordHash = hashPasswordSync(md5(admin.password));
```

Update or insert the configured username, set `enabled = 1`, and log only the username. Remove every embedded administrator username/password pair.

Update `.env.example` to placeholders:

```dotenv
JWT_SECRET=replace-with-at-least-32-random-characters
ADMIN_USERNAME=replace-with-production-admin-username
ADMIN_PASSWORD=replace-with-at-least-12-random-characters
```

- [ ] **Step 6: Verify GREEN and type safety**

Run:

```powershell
pnpm.cmd run test:unit -- authProductionConfig.test.ts
pnpm.cmd run check:server
```

Expected: focused tests pass and server type check exits 0.

- [ ] **Step 7: Commit only auth-related files**

```powershell
git add -- packages/server/modules/auth/config.ts packages/server/modules/auth/service.ts packages/server/modules/auth/index.ts packages/server/app.ts tests/unit/authProductionConfig.test.ts tests/unit/runUnitTests.cjs .env.example
git commit -m "fix: require production auth secrets"
```

---

### Task 2: Make the final runtime image self-contained

**Files:**
- Modify: `packages/server/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `Dockerfile`
- Modify: `.github/workflows/deploy-master.yml`

**Interfaces:**
- Consumes: existing `packages/server/dev-runtime.cjs` and `packages/shared/dist` package exports.
- Produces: a runtime image containing TypeScript and compiled shared modules.

- [ ] **Step 1: Record the current failing production dependency assertion**

Run:

```powershell
pnpm.cmd --filter @ai-presenter/server list --prod typescript --depth 0
```

Expected RED evidence: no production `typescript` dependency is listed while `dev-runtime.cjs` requires it.

- [ ] **Step 2: Move TypeScript to production dependencies and update the lockfile**

Move the existing `"typescript": "^6.0.3"` entry from `devDependencies` to `dependencies`; do not add a second package or change its version. Then run:

```powershell
pnpm.cmd install --lockfile-only
```

- [ ] **Step 3: Copy the shared runtime build into the final image**

After copying shared source in the runtime stage, add:

```dockerfile
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
```

Keep the existing TypeScript server runtime and frontend `dist` copy.

- [ ] **Step 4: Make CI validate the final image**

Replace the builder-only command with:

```yaml
- name: Validate Docker runtime image
  run: docker build -t consensus-runtime-check:${{ github.sha }} .
```

- [ ] **Step 5: Verify the production dependency and workspace build**

Run:

```powershell
pnpm.cmd --filter @ai-presenter/server list --prod typescript --depth 0
pnpm.cmd run build
```

Expected: `typescript@6.0.3` is listed as a production dependency and the build exits 0.

- [ ] **Step 6: Commit runtime-image files**

```powershell
git add -- packages/server/package.json pnpm-lock.yaml Dockerfile .github/workflows/deploy-master.yml
git commit -m "fix: make production image self-contained"
```

---

### Task 3: Persist resources and preserve load-balancer protocol

**Files:**
- Modify: `docker-compose.yml`
- Modify: `nginx/nginx.conf`

**Interfaces:**
- Produces: `consensus-resources` named volume mounted at `/app/packages/server/resources`.
- Consumes: incoming Tencent Cloud `X-Forwarded-Proto` and existing Express resource paths.

- [ ] **Step 1: Capture current Compose assertions as RED evidence**

Run:

```powershell
$config = docker compose config
$config | Select-String '/app/packages/server/resources'
```

Expected: no resource mount is found.

- [ ] **Step 2: Add persistent resource storage**

Add to the application volumes:

```yaml
- consensus-resources:/app/packages/server/resources
```

Declare it next to `consensus-data`:

```yaml
consensus-resources:
  driver: local
```

- [ ] **Step 3: Preserve the load balancer protocol**

At Nginx top level add:

```nginx
map $http_x_forwarded_proto $forwarded_proto {
    default $http_x_forwarded_proto;
    "" $scheme;
}
```

Use `proxy_set_header X-Forwarded-Proto $forwarded_proto;` for WebSocket, API, admin, and client proxy locations.

- [ ] **Step 4: Validate Compose and Nginx configuration**

Run:

```powershell
docker compose config --quiet
docker run --rm -v "${PWD}/nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro" nginx:1.27-alpine nginx -t
```

Expected: both commands exit 0. If the local Docker daemon is unavailable, record that external blocker and rely on the CI runtime-image gate for final validation.

- [ ] **Step 5: Commit persistence and proxy configuration**

```powershell
git add -- docker-compose.yml nginx/nginx.conf
git commit -m "fix: persist resources behind load balancer"
```

---

### Task 4: Gracefully stop the HTTP server

**Files:**
- Create: `packages/server/lifecycle.ts`
- Create: `tests/unit/serverLifecycle.test.ts`
- Modify: `packages/server/index.ts`
- Modify: `tests/unit/runUnitTests.cjs`

**Interfaces:**
- Produces: `createGracefulShutdownHandler(server, options): (signal: NodeJS.Signals) => void`
- Consumes: Node HTTP `Server.close`, `process.once`, and a 10-second timeout.

- [ ] **Step 1: Write failing lifecycle tests**

Use injected `exit`, `setTimer`, and `clearTimer` functions so tests never terminate the runner. Cover:

```ts
test('graceful shutdown closes once and exits zero', () => {
  const exits: number[] = [];
  const server = { close: (callback: (error?: Error) => void) => callback() };
  const shutdown = createGracefulShutdownHandler(server as never, testOptions(exits));
  shutdown('SIGTERM');
  shutdown('SIGINT');
  assert.deepEqual(exits, [0]);
});

test('graceful shutdown exits non-zero on close error', () => {
  const exits: number[] = [];
  const server = { close: (callback: (error?: Error) => void) => callback(new Error('close failed')) };
  createGracefulShutdownHandler(server as never, testOptions(exits))('SIGTERM');
  assert.deepEqual(exits, [1]);
});

test('graceful shutdown timeout exits non-zero', () => {
  const exits: number[] = [];
  let timeout!: () => void;
  const server = { close: () => undefined };
  const shutdown = createGracefulShutdownHandler(server as never, {
    ...testOptions(exits),
    setTimer: (callback) => { timeout = callback; return { unref() {} } as never; },
  });
  shutdown('SIGTERM');
  timeout();
  assert.deepEqual(exits, [1]);
});
```

Register the file in `runUnitTests.cjs`.

- [ ] **Step 2: Run focused test and verify RED**

```powershell
pnpm.cmd run test:unit -- serverLifecycle.test.ts
```

Expected: FAIL because `packages/server/lifecycle.ts` does not exist.

- [ ] **Step 3: Implement the minimal shutdown helper**

The helper must:

```ts
if (shuttingDown) return;
shuttingDown = true;
const timer = setTimer(() => exit(1), timeoutMs);
timer.unref?.();
server.close((error) => {
  clearTimer(timer);
  exit(error ? 1 : 0);
});
```

Default dependencies use `process.exit`, `setTimeout`, `clearTimeout`, and `timeoutMs: 10_000`.

Wire it in `index.ts`:

```ts
const shutdown = createGracefulShutdownHandler(server);
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
```

- [ ] **Step 4: Verify GREEN and server type safety**

```powershell
pnpm.cmd run test:unit -- serverLifecycle.test.ts
pnpm.cmd run check:server
```

Expected: focused tests pass and server check exits 0.

- [ ] **Step 5: Commit lifecycle files**

```powershell
git add -- packages/server/lifecycle.ts packages/server/index.ts tests/unit/serverLifecycle.test.ts tests/unit/runUnitTests.cjs
git commit -m "fix: gracefully stop production server"
```

---

### Task 5: Synchronize deployment documentation

**Files:**
- Modify: `docs/project-summary.md`
- Modify: `docs/project-server.md`

**Interfaces:**
- Documents: required secrets, Tencent Cloud LB boundary, persistent volumes, backup/restore, health verification, and single-instance limitation.

- [ ] **Step 1: Update project summary deployment contract**

Document the three required production auth variables, full runtime-image CI gate, LB-terminated HTTPS, and the two named volumes.

- [ ] **Step 2: Update server operations guidance**

Add PowerShell/Bash-friendly operator commands for:

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl -fsS "https://${PRODUCTION_DOMAIN}/api/toc/games"
```

Document backing up both `consensus-data` and `consensus-resources` before deployment and restoring them only while the application container is stopped. State that CVM port 80 must accept traffic only from the Tencent Cloud load balancer.

- [ ] **Step 3: Review documentation against code**

Confirm exact variable names, mount paths, ports, health URL, and CI gate match the implemented files. Run:

```powershell
git diff --check -- docs/project-summary.md docs/project-server.md
```

Expected: no whitespace errors.

- [ ] **Step 4: Preserve pre-existing documentation edits**

Do not stage `docs/project-server.md` wholesale because it was modified before this task. Leave documentation changes unstaged for explicit user review, or stage only verified new hunks interactively without including unrelated content.

---

### Task 6: Execute release-candidate verification

**Files:**
- Verify only; no new files expected.

**Interfaces:**
- Consumes: all earlier tasks.
- Produces: release gate evidence and remaining infrastructure prerequisites.

- [ ] **Step 1: Scan tracked source for removed fixed credentials**

Search the auth module for the former embedded username, password, and JWT fallback. Expected: no production credential literals remain.

- [ ] **Step 2: Run the complete repository release gates**

```powershell
pnpm.cmd run check
pnpm.cmd run build
pnpm.cmd run test:unit
pnpm.cmd run test:workflow
pnpm.cmd run test:migration
```

Expected: every command exits 0 with zero failed tests.

- [ ] **Step 3: Validate Compose and final runtime image**

```powershell
docker compose config --quiet
docker build -t consensus-release-candidate .
docker compose up -d --build
docker compose ps
```

Expected: `app` becomes healthy and `nginx` remains running. Do not claim image/runtime validation if Docker daemon access is unavailable.

- [ ] **Step 4: Smoke test local and load-balancer routes**

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1/api/toc/games
```

After infrastructure deployment, set `PRODUCTION_DOMAIN` to the real domain, verify `https://${PRODUCTION_DOMAIN}/api/toc/games`, and open a WebSocket game connection through the Tencent Cloud load balancer.

- [ ] **Step 5: Final audit**

Run `git status --short` and `git diff --check`. Report separately:

- files changed by this task;
- pre-existing user changes still present;
- passing and blocked verification commands;
- required CVM `.env`, load-balancer listener/health check, security-group restriction, DNS, and volume backup prerequisites.
