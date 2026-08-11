import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '../..');

interface ComposeService {
  image?: string;
  restart?: string;
  ports?: unknown[];
  profiles?: string[];
  command?: string[];
  environment?: Record<string, string>;
  volumes?: Array<{ source?: string; target?: string; type?: string }>;
  depends_on?: Record<string, { condition?: string }>;
  healthcheck?: { test?: string[] };
}

interface ComposeConfig {
  services: Record<string, ComposeService>;
  volumes?: Record<string, unknown>;
}

async function createComposeFixture(t: test.TestContext): Promise<Record<string, string>> {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'consensus-postgres-compose-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const files = await Promise.all([
    'bootstrap-password',
    'app-password',
    'migrator-password',
    'ca.crt',
    'server.crt',
    'server.key',
  ].map(async (name) => {
    const target = path.join(temporary, name);
    await fs.writeFile(target, `${name}\n`);
    return [name, target] as const;
  }));
  const file = Object.fromEntries(files);
  return {
    ...process.env,
    POSTGRES_BOOTSTRAP_PASSWORD_FILE: file['bootstrap-password'],
    POSTGRES_APP_PASSWORD_FILE: file['app-password'],
    POSTGRES_MIGRATOR_PASSWORD_FILE: file['migrator-password'],
    POSTGRES_TLS_CA_FILE: file['ca.crt'],
    POSTGRES_TLS_CERT_FILE: file['server.crt'],
    POSTGRES_TLS_KEY_FILE: file['server.key'],
    POSTGRES_APP_DATABASE_URL: 'postgresql://consensus_app:app-password@postgres:5432/consensus',
    POSTGRES_MIGRATOR_DATABASE_URL: 'postgresql://consensus_migrator:migrator-password@postgres:5432/consensus',
  };
}

function loadComposeConfig(environment: Record<string, string>): ComposeConfig {
  const result = spawnSync('docker', ['compose', '--profile', 'ops', 'config', '--format', 'json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: environment,
  });
  assert.equal(result.status, 0, `docker compose config failed:\n${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout) as ComposeConfig;
}

test('production Compose keeps PostgreSQL private, durable, TLS-only, and behind its health gate', async (t) => {
  const config = loadComposeConfig(await createComposeFixture(t));
  const postgres = config.services.postgres;
  const app = config.services.app;
  assert.ok(postgres, 'production Compose must define PostgreSQL');
  assert.equal(postgres.image, 'postgres:16-alpine');
  assert.equal(postgres.restart, 'unless-stopped');
  assert.deepEqual(postgres.ports ?? [], [], 'PostgreSQL must not publish a host port');
  assert.equal(postgres.environment?.POSTGRES_DB, 'consensus');
  assert.ok(postgres.volumes?.some(({ source, target }) => source === 'consensus-postgres-data' && target === '/var/lib/postgresql/data'), 'PGDATA must use the durable named volume');
  assert.ok(config.volumes?.['consensus-postgres-data'], 'the PostgreSQL data volume must be declared');
  assert.ok(postgres.healthcheck?.test?.join(' ').includes('pg_isready'), 'PostgreSQL must expose a readiness health check');
  assert.ok(postgres.environment?.POSTGRES_PASSWORD_FILE?.startsWith('/run/secrets/'), 'bootstrap password must come from a mounted secret file');
  assert.ok(postgres.volumes?.some(({ target }) => target === '/run/postgres-tls/server.crt'), 'server certificate must be host-provided');
  assert.ok(postgres.volumes?.some(({ target }) => target === '/run/postgres-tls/server.key'), 'server private key must be host-provided');
  assert.ok(postgres.volumes?.some(({ target }) => target === '/run/postgres-tls/ca.crt'), 'CA must be host-provided');
  assert.ok(postgres.command?.includes('ssl=on'), 'PostgreSQL must enable TLS');
  assert.ok(postgres.command?.includes('password_encryption=scram-sha-256'), 'PostgreSQL must create SCRAM credentials');
  assert.equal(app.depends_on?.postgres?.condition, 'service_healthy', 'the app must wait for healthy PostgreSQL');
});

test('production Compose gives runtime and offline operations distinct TLS database identities', async (t) => {
  const config = loadComposeConfig(await createComposeFixture(t));
  const app = config.services.app;
  const migrator = config.services.migrator;
  assert.equal(app.environment?.DATABASE_URL, 'postgresql://consensus_app:app-password@postgres:5432/consensus');
  assert.equal(app.environment?.DATABASE_SSL, 'verify-full');
  assert.equal(app.environment?.DATABASE_SCHEMA, 'consensus');
  assert.equal(app.environment?.DATABASE_POOL_MAX, '10');
  assert.equal(app.environment?.DATABASE_CONNECTION_TIMEOUT_MS, '5000');
  assert.equal(app.environment?.DATABASE_STATEMENT_TIMEOUT_MS, '30000');
  assert.ok(app.environment?.DATABASE_CA_PATH, 'the app must receive a mounted CA path');
  assert.ok(app.volumes?.some(({ target }) => target === app.environment?.DATABASE_CA_PATH), 'the app must mount only the CA file used for TLS verification');
  assert.equal(app.volumes?.some(({ target }) => target === '/run/postgres-tls/server.key' || target === '/run/postgres-tls/server.crt'), false, 'the app must not mount PostgreSQL server key material');
  assert.ok(migrator, 'offline operations must use a separate migrator service');
  assert.deepEqual(migrator.profiles, ['ops'], 'ordinary docker compose up must not start the migrator');
  assert.equal(migrator.environment?.DATABASE_URL, 'postgresql://consensus_migrator:migrator-password@postgres:5432/consensus');
  assert.equal(migrator.environment?.DATABASE_SSL, 'verify-full');
  assert.equal(migrator.depends_on?.postgres?.condition, 'service_healthy');
});

test('PostgreSQL role bootstrap rejects missing or empty role secret files before psql can run', async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'consensus-postgres-role-init-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const appSecret = path.join(temporary, 'app-password');
  const migratorSecret = path.join(temporary, 'migrator-password');
  await fs.writeFile(appSecret, 'app-password\n');
  await fs.writeFile(migratorSecret, '');
  const script = path.join(repoRoot, 'scripts', 'ops', 'postgres', 'init-production-roles.sh');
  const result = spawnSync('docker', [
    'run', '--rm', '--entrypoint', 'sh',
    '-v', `${script}:/init-production-roles.sh:ro`,
    '-v', `${appSecret}:/run/secrets/postgres_app_password:ro`,
    '-v', `${migratorSecret}:/run/secrets/postgres_migrator_password:ro`,
    '-e', 'POSTGRES_APP_PASSWORD_FILE=/run/secrets/postgres_app_password',
    '-e', 'POSTGRES_MIGRATOR_PASSWORD_FILE=/run/secrets/postgres_migrator_password',
    'postgres:16-alpine', '/init-production-roles.sh',
  ], {
    cwd: temporary,
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0, 'an empty role password file must stop initialization');
  assert.match(`${result.stdout}\n${result.stderr}`, /non-empty|secret/i, 'initialization must explain that the role secret file is invalid');
});
