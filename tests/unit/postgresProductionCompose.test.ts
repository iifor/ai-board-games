import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '../..');

interface ComposeMount {
  source?: string;
  target?: string;
  type?: string;
}

interface ComposeSecret {
  source?: string;
  target?: string;
}

interface ComposeService {
  image?: string;
  restart?: string;
  ports?: unknown[];
  profiles?: string[];
  command?: string[];
  entrypoint?: string[];
  build?: { target?: string };
  environment?: Record<string, string>;
  volumes?: ComposeMount[];
  tmpfs?: string[];
  secrets?: ComposeSecret[];
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
  const secretDirectory = path.join(temporary, 'secrets');
  const tlsDirectory = path.join(temporary, 'postgres-tls');
  await Promise.all([secretDirectory, tlsDirectory].map((entry) => fs.mkdir(entry)));
  const passwordFiles = await Promise.all(['bootstrap', 'app', 'migrator'].map(async (name) => {
    const target = path.join(secretDirectory, `${name}-password`);
    await fs.writeFile(target, `${randomBytes(18).toString('base64url')}\n`);
    return [name, target] as const;
  }));
  await Promise.all([
    fs.writeFile(path.join(tlsDirectory, 'ca.crt'), 'test-ca\n'),
    fs.writeFile(path.join(tlsDirectory, 'server.crt'), 'test-cert\n'),
    fs.writeFile(path.join(tlsDirectory, 'server.key'), 'test-key\n'),
  ]);
  const passwordFile = Object.fromEntries(passwordFiles);
  return {
    ...process.env,
    POSTGRES_BOOTSTRAP_PASSWORD_FILE: passwordFile.bootstrap,
    POSTGRES_APP_PASSWORD_FILE: passwordFile.app,
    POSTGRES_MIGRATOR_PASSWORD_FILE: passwordFile.migrator,
    POSTGRES_TLS_SOURCE_DIR: tlsDirectory,
    POSTGRES_CA_FILE: path.join(tlsDirectory, 'ca.crt'),
  };
}

function runCompose(args: string[], environment: Record<string, string>) {
  return spawnSync('docker', ['compose', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: environment,
  });
}

function loadComposeConfig(environment: Record<string, string>): ComposeConfig {
  const result = runCompose([
    '--profile', 'application', '--profile', 'ops', '--profile', 'traffic',
    'config', '--format', 'json',
  ], environment);
  assert.equal(result.status, 0, `docker compose config failed:\n${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout) as ComposeConfig;
}

function hasSecret(service: ComposeService, source: string, target: string): boolean {
  return service.secrets?.some((secret) => secret.source === source && secret.target === target) ?? false;
}

test('ordinary Compose configuration needs no ops credential and excludes the migrator profile', async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'consensus-postgres-empty-env-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const emptyEnv = path.join(temporary, 'empty.env');
  await fs.writeFile(emptyEnv, '');
  const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('POSTGRES_')));
  const result = runCompose(['--env-file', emptyEnv, 'config', '--services'], environment);
  assert.equal(result.status, 0, `ordinary Compose config must not require ops settings:\n${result.stderr}`);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/), ['postgres']);
});

test('production Compose keeps PostgreSQL private, durable, TLS-only, and behind an application-role query health gate', async (t) => {
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
  assert.deepEqual(postgres.entrypoint, ['/bin/sh', '/usr/local/bin/start-production-postgres.sh']);
  assert.ok(postgres.volumes?.some(({ target }) => target === '/run/postgres-tls-source'), 'root-mounted TLS sources must be separate from the staged runtime directory');
  assert.ok(postgres.tmpfs?.some((entry) => entry.startsWith('/run/postgres-tls')), 'staged TLS key material must live only in container tmpfs');
  assert.ok(postgres.command?.includes('ssl=on'), 'PostgreSQL must enable TLS');
  assert.ok(postgres.command?.includes('password_encryption=scram-sha-256'), 'PostgreSQL must create SCRAM credentials');
  const health = postgres.healthcheck?.test?.join(' ') ?? '';
  assert.match(health, /\bpsql\b/, 'health must execute a real database query');
  assert.match(health, /consensus_app/, 'health must authenticate as the runtime application role');
  assert.match(health, /PGSSLMODE=verify-full/, 'health must verify the PostgreSQL certificate hostname');
  assert.match(health, /PGSSLROOTCERT=\/run\/postgres-tls\/ca\.crt/, 'health must trust only the staged CA');
  assert.match(health, /SELECT 1/, 'health must prove query execution');
  assert.match(health, /postgres_app_password/, 'health must read its password from the mounted secret');
  assert.doesNotMatch(health, /pg_isready|consensus_bootstrap/, 'socket/bootstrap readiness is not an application health proof');
  assert.equal(app.depends_on?.postgres?.condition, 'service_healthy', 'the app must wait for healthy PostgreSQL');
});

test('Compose gives runtime and offline operations fixed, secret-backed TLS identities in distinct images', async (t) => {
  const config = loadComposeConfig(await createComposeFixture(t));
  const app = config.services.app;
  const migrator = config.services.migrator;
  assert.equal(app.image, 'consensus-production-app');
  assert.equal(migrator.image, 'consensus-production-migrator');
  assert.equal(app.build?.target, 'runtime', 'Compose must build the final runtime stage for app');
  assert.equal(app.environment?.DATABASE_URL, undefined, 'the app URL must be assembled only inside its child process');
  assert.ok(hasSecret(app, 'postgres_app_password', '/run/secrets/postgres_app_password'));
  assert.equal(app.environment?.DATABASE_SSL, 'verify-full');
  assert.equal(app.environment?.DATABASE_SCHEMA, 'consensus');
  assert.equal(app.environment?.DATABASE_POOL_MAX, '10');
  assert.equal(app.environment?.DATABASE_CONNECTION_TIMEOUT_MS, '5000');
  assert.equal(app.environment?.DATABASE_STATEMENT_TIMEOUT_MS, '30000');
  assert.equal(app.environment?.DATABASE_CA_PATH, '/run/secrets/postgres_ca');
  assert.ok(hasSecret(app, 'postgres_ca', '/run/secrets/postgres_ca'), 'the app must mount exactly the CA file');
  assert.equal(app.volumes?.some(({ target }) => target?.startsWith('/run/postgres-ca')), false, 'the app must not mount a directory that could expose server key material');
  assert.equal(app.volumes?.some(({ target }) => target === '/run/postgres-tls-source' || target === '/run/postgres-tls'), false, 'the app must not mount server key material');

  assert.ok(migrator, 'offline operations must use a separate migrator service');
  assert.deepEqual(migrator.profiles, ['ops'], 'ordinary docker compose up must not start the migrator');
  assert.equal(migrator.build?.target, 'ops');
  assert.equal(migrator.environment?.DATABASE_URL, undefined, 'the migrator URL must be assembled only inside its child process');
  assert.ok(hasSecret(migrator, 'postgres_migrator_password', '/run/secrets/postgres_migrator_password'));
  assert.equal(migrator.environment?.DATABASE_SSL, 'verify-full');
  assert.equal(migrator.environment?.DATABASE_SCHEMA, 'consensus');
  assert.equal(migrator.environment?.DATABASE_CA_PATH, '/run/secrets/postgres_ca');
  assert.ok(hasSecret(migrator, 'postgres_ca', '/run/secrets/postgres_ca'), 'the migrator must mount exactly the CA file');
  assert.equal(migrator.depends_on?.postgres?.condition, 'service_healthy');
});

test('PostgreSQL role bootstrap rejects missing or empty role secret files before psql can run', async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'consensus-postgres-role-init-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const appSecret = path.join(temporary, 'app-password');
  const migratorSecret = path.join(temporary, 'migrator-password');
  await fs.writeFile(appSecret, `${randomBytes(18).toString('base64url')}\n`);
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
  ], { cwd: temporary, encoding: 'utf8' });
  assert.notEqual(result.status, 0, 'an empty role password file must stop initialization');
  assert.match(`${result.stdout}\n${result.stderr}`, /non-empty|secret/i, 'initialization must explain that the role secret file is invalid');
});
