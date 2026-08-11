import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '../..');
const composeFile = path.join(repoRoot, 'docker-compose.yml');

function run(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    encoding: 'utf8',
    timeout: options.timeout ?? 120_000,
  });
  assert.equal(result.error, undefined, `${command} could not start: ${result.error?.message}`);
  return result;
}

function mustRun(command: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number }): string {
  const result = run(command, args, options);
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function parseProbe(output: string): Record<string, unknown> {
  const line = output.split(/\r?\n/).reverse().find((entry) => entry.trim().startsWith('{'));
  assert.ok(line, `probe did not emit JSON:\n${output}`);
  return JSON.parse(line) as Record<string, unknown>;
}

test('ephemeral production Compose enforces TLS, SCRAM, fixed roles, default grants, and image isolation', { timeout: 1_200_000 }, async () => {
  const suffix = randomBytes(6).toString('hex');
  const project = `consensus_tls_${suffix}`;
  const certWorkVolume = `${project}_cert_work`;
  const tlsSourceVolume = `${project}_tls_source`;
  const appImage = `${project}-app`;
  const migratorImage = `${project}-migrator`;
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), `${project}-`));
  const overrideFile = path.join(temporary, 'compose.override.yml');
  const appProbeFile = path.join(temporary, 'app-probe.cjs');
  const migratorProbeFile = path.join(temporary, 'migrator-probe.cjs');
  const bootstrapSecret = path.join(temporary, 'bootstrap-password');
  const appSecret = path.join(temporary, 'app-password');
  const migratorSecret = path.join(temporary, 'migrator-password');
  const bootstrapPassword = `${randomBytes(16).toString('base64url')}:@/%`;
  const appPassword = `${randomBytes(16).toString('base64url')}:@/%`;
  const migratorPassword = `${randomBytes(16).toString('base64url')}:@/%`;
  await Promise.all([
    fs.writeFile(bootstrapSecret, `${bootstrapPassword}\n`),
    fs.writeFile(appSecret, `${appPassword}\n`),
    fs.writeFile(migratorSecret, `${migratorPassword}\n`),
  ]);

  const environment = {
    ...process.env,
    POSTGRES_BOOTSTRAP_PASSWORD_FILE: bootstrapSecret,
    POSTGRES_APP_PASSWORD_FILE: appSecret,
    POSTGRES_MIGRATOR_PASSWORD_FILE: migratorSecret,
    POSTGRES_CA_FILE: path.join(temporary, 'ca.crt'),
  };
  const composeArgs = ['--project-name', project, '-f', composeFile, '-f', overrideFile];
  const compose = (args: string[], timeout = 120_000) => run('docker', ['compose', ...composeArgs, ...args], { env: environment, timeout });
  const composeMust = (args: string[], timeout = 120_000) => {
    const result = compose(args, timeout);
    assert.equal(result.status, 0, `docker compose ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
    return result.stdout.trim();
  };
  const composeProbe = (args: string[]) => {
    const result = compose(args);
    assert.equal(result.status, 0, `docker compose ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
    const output = `${result.stdout}\n${result.stderr}`;
    for (const password of [bootstrapPassword, appPassword, migratorPassword]) {
      assert.equal(output.includes(password), false, 'entrypoints must not print database credentials');
    }
    return result.stdout.trim();
  };

  try {
    for (const volume of [certWorkVolume, tlsSourceVolume]) {
      mustRun('docker', ['volume', 'create', volume]);
    }
    const certificateScript = [
      'set -eu',
      "openssl req -x509 -newkey rsa:2048 -nodes -keyout /work/ca.key -out /work/ca.crt -subj '/CN=CONSENSUS test CA' -days 1",
      "openssl req -newkey rsa:2048 -nodes -keyout /work/server.key -out /work/server.csr -subj '/CN=postgres' -addext 'subjectAltName=DNS:postgres'",
      'openssl x509 -req -in /work/server.csr -CA /work/ca.crt -CAkey /work/ca.key -CAcreateserial -out /work/server.crt -days 1 -copy_extensions copy',
      'install -m 0644 /work/ca.crt /tls/ca.crt',
      'install -m 0644 /work/server.crt /tls/server.crt',
      'install -o 0 -g 0 -m 0600 /work/server.key /tls/server.key',
      'install -m 0644 /work/ca.crt /host/ca.crt',
    ].join('; ');
    mustRun('docker', [
      'run', '--rm', '--entrypoint', 'sh',
      '-v', `${certWorkVolume}:/work`,
      '-v', `${tlsSourceVolume}:/tls`,
      '-v', `${temporary}:/host`,
      'alpine/openssl', '-c', certificateScript,
    ]);
    const san = mustRun('docker', ['run', '--rm', '-v', `${tlsSourceVolume}:/tls:ro`, 'alpine/openssl', 'x509', '-in', '/tls/server.crt', '-noout', '-ext', 'subjectAltName']);
    assert.match(san, /DNS:postgres/);
    const sourceKeyMode = mustRun('docker', ['run', '--rm', '--entrypoint', 'sh', '-v', `${tlsSourceVolume}:/tls:ro`, 'alpine/openssl', '-c', "stat -c '%u:%g:%a' /tls/server.key"]);
    assert.equal(sourceKeyMode, '0:0:600', 'the mounted source key fixture must be root:root 0600');

    await fs.writeFile(overrideFile, [
      'services:',
      '  postgres:',
      '    volumes:',
      '      - type: volume',
      `        source: ${tlsSourceVolume}`,
      '        target: /run/postgres-tls-source',
      '        read_only: true',
      '  app:',
      `    image: ${appImage}`,
      '  migrator:',
      `    image: ${migratorImage}`,
      'volumes:',
      `  ${tlsSourceVolume}:`,
      '    external: true',
      `    name: ${tlsSourceVolume}`,
      '',
    ].join('\n'));

    const config = compose(['config', '--services']);
    assert.equal(config.status, 0, `base production config must not require ops variables:\n${config.stderr}`);
    assert.deepEqual(config.stdout.trim().split(/\r?\n/), ['postgres', 'app', 'nginx']);
    composeMust(['--profile', 'ops', 'build', 'app', 'migrator'], 900_000);
    composeMust(['up', '-d', '--wait', '--wait-timeout', '90', 'postgres'], 180_000);

    const stagedKey = composeMust(['exec', '-T', 'postgres', 'sh', '-c', "uid=$(id -u postgres); gid=$(id -g postgres); actual=$(stat -c '%u:%g:%a' /run/postgres-tls/server.key); test \"$actual\" = \"$uid:$gid:600\"; printf '%s' \"$actual\""]);
    assert.match(stagedKey, /^\d+:\d+:600$/);
    const securityState = composeMust(['exec', '-T', 'postgres', 'psql', '-U', 'consensus_bootstrap', '-d', 'consensus', '-Atc', "SELECT (to_regnamespace('consensus') IS NULL)::text || '|' || current_setting('password_encryption')"]);
    assert.equal(securityState, 'true|scram-sha-256', 'bootstrap must not create the application schema');
    const hba = composeMust(['exec', '-T', 'postgres', 'psql', '-U', 'consensus_bootstrap', '-d', 'consensus', '-Atc', "SELECT type || ':' || auth_method FROM pg_hba_file_rules WHERE type IN ('hostssl','hostnossl') ORDER BY type, line_number"]);
    assert.match(hba, /hostnossl:reject/);
    assert.match(hba, /hostssl:scram-sha-256/);
    const scramRoles = composeMust(['exec', '-T', 'postgres', 'psql', '-U', 'consensus_bootstrap', '-d', 'consensus', '-Atc', "SELECT bool_and(rolpassword LIKE 'SCRAM-SHA-256$%')::text FROM pg_authid WHERE rolname IN ('consensus_app','consensus_migrator')"]);
    assert.equal(scramRoles, 'true');

    const plaintext = compose(['exec', '-T', 'postgres', 'sh', '-c', "PGPASSWORD=$(cat /run/secrets/postgres_app_password) PGSSLMODE=disable psql -h postgres -U consensus_app -d consensus -Atc 'SELECT 1'"]);
    assert.notEqual(plaintext.status, 0, 'non-TLS TCP must be rejected');

    const appCmd = mustRun('docker', ['image', 'inspect', '--format', '{{json .Config.Cmd}}', appImage]);
    assert.equal(appCmd, '["node","scripts/ops/postgres/start-production-app.cjs"]');
    const migratorEntrypoint = mustRun('docker', ['image', 'inspect', '--format', '{{json .Config.Entrypoint}}', migratorImage]);
    assert.equal(migratorEntrypoint, '["node","scripts/ops/postgres/run-production-migrator.cjs"]');
    mustRun('docker', ['run', '--rm', '--entrypoint', 'node', appImage, '-e', "const fs=require('node:fs'); if(fs.existsSync('/app/packages/db-migrator')) process.exit(1); try { require.resolve('better-sqlite3'); process.exit(1); } catch { process.exit(0); }"]);

    await fs.writeFile(appProbeFile, `
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const pnpmRoot = '/app/node_modules/.pnpm';
process.env.NODE_PATH = fs.readdirSync(pnpmRoot).map((name) => path.join(pnpmRoot, name, 'node_modules')).join(path.delimiter);
Module._initPaths();
const { Client } = require('pg');
(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { ca: fs.readFileSync(process.env.DATABASE_CA_PATH, 'utf8'), rejectUnauthorized: true } });
  await client.connect();
  const identity = (await client.query("SELECT current_user AS role, current_database() AS database, (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS ssl, to_regnamespace('consensus') IS NOT NULL AS schema_exists")).rows[0];
  identity.argv = process.argv.slice(2);
  if (process.env.PROBE_MODE === 'dml') {
    const inserted = await client.query("INSERT INTO consensus.entrypoint_probe(value) VALUES ('created') RETURNING id");
    await client.query("UPDATE consensus.entrypoint_probe SET value='updated' WHERE id=$1", [inserted.rows[0].id]);
    const selected = await client.query('SELECT value FROM consensus.entrypoint_probe WHERE id=$1', [inserted.rows[0].id]);
    await client.query('DELETE FROM consensus.entrypoint_probe WHERE id=$1', [inserted.rows[0].id]);
    identity.dml = selected.rows[0].value === 'updated';
  } else {
    try { await client.query('CREATE SCHEMA consensus'); identity.create_denied = false; }
    catch (error) { identity.create_denied = error.code === '42501'; }
  }
  await client.end();
  console.log(JSON.stringify(identity));
})().catch((error) => { console.error(error.code || error.message); process.exit(1); });
`);
    await fs.writeFile(migratorProbeFile, `
const fs = require('node:fs');
const { Client } = require('pg');
(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { ca: fs.readFileSync(process.env.DATABASE_CA_PATH, 'utf8'), rejectUnauthorized: true } });
  await client.connect();
  const identity = (await client.query("SELECT current_user AS role, current_database() AS database, (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS ssl, to_regnamespace('consensus') IS NOT NULL AS schema_exists")).rows[0];
  identity.argv = process.argv.slice(2);
  if (process.argv[2] === 'setup') {
    await client.query('CREATE SCHEMA consensus');
    await client.query('CREATE TABLE consensus.entrypoint_probe (id serial PRIMARY KEY, value text NOT NULL)');
    identity.created = true;
  } else if (process.argv[2] === 'cleanup') {
    await client.query('DROP SCHEMA consensus CASCADE');
    identity.dropped = true;
  } else { throw new Error('unknown probe action'); }
  await client.end();
  console.log(JSON.stringify(identity));
})().catch((error) => { console.error(error.code || error.message); process.exit(1); });
`);

    const appPre = parseProbe(composeProbe(['run', '--rm', '--no-deps', '-e', 'PROBE_MODE=pre', '-v', `${appProbeFile}:/app/packages/server/dev-runtime.cjs:ro`, 'app']));
    assert.deepEqual(appPre, { role: 'consensus_app', database: 'consensus', ssl: true, schema_exists: false, argv: [], create_denied: true });
    const migratorSetup = parseProbe(composeProbe(['--profile', 'ops', 'run', '--rm', '--no-deps', '-v', `${migratorProbeFile}:/app/packages/db-migrator/dist/cli.js:ro`, 'migrator', 'setup']));
    assert.deepEqual(migratorSetup, { role: 'consensus_migrator', database: 'consensus', ssl: true, schema_exists: false, argv: ['setup'], created: true });
    const appDml = parseProbe(composeProbe(['run', '--rm', '--no-deps', '-e', 'PROBE_MODE=dml', '-v', `${appProbeFile}:/app/packages/server/dev-runtime.cjs:ro`, 'app']));
    assert.deepEqual(appDml, { role: 'consensus_app', database: 'consensus', ssl: true, schema_exists: true, argv: [], dml: true });
    const migratorCleanup = parseProbe(composeProbe(['--profile', 'ops', 'run', '--rm', '--no-deps', '-v', `${migratorProbeFile}:/app/packages/db-migrator/dist/cli.js:ro`, 'migrator', 'cleanup']));
    assert.equal(migratorCleanup.dropped, true);
  } finally {
    compose(['--profile', 'ops', 'down', '--volumes', '--remove-orphans'], 180_000);
    for (const volume of [certWorkVolume, tlsSourceVolume]) {
      run('docker', ['volume', 'rm', '-f', volume]);
    }
    for (const image of [appImage, migratorImage]) {
      run('docker', ['image', 'rm', '-f', image]);
    }
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
