import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '../..');
const scriptsRoot = path.join(repoRoot, 'scripts', 'ops', 'postgres');

const wrappers = [
  {
    name: 'app',
    script: 'start-production-app.cjs',
    secretTarget: '/run/secrets/postgres_app_password',
    childTarget: '/packages/server/dev-runtime.cjs',
    role: 'consensus_app',
    childArgs: [] as string[],
  },
  {
    name: 'migrator',
    script: 'run-production-migrator.cjs',
    secretTarget: '/run/secrets/postgres_migrator_password',
    childTarget: '/packages/db-migrator/dist/cli.js',
    role: 'consensus_migrator',
    childArgs: ['probe'],
  },
] as const;

function docker(args: string[]) {
  return spawnSync('docker', args, { cwd: repoRoot, encoding: 'utf8', timeout: 30_000 });
}

function assertDockerSuccess(result: ReturnType<typeof docker>, operation: string): void {
  assert.equal(result.error, undefined, `${operation} could not start: ${result.error?.message}`);
  assert.equal(result.status, 0, `${operation} failed:\n${result.stdout}\n${result.stderr}`);
}

async function waitForFile(target: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      await fs.access(target);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  assert.fail(`timed out waiting for ${target}`);
}

for (const wrapper of wrappers) {
  test(`${wrapper.name} wrapper removes one terminal CRLF and preserves all other password characters without leakage`, async (t) => {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), `postgres-${wrapper.name}-secret-`));
    t.after(() => fs.rm(temporary, { recursive: true, force: true }));
    const normalizedPassword = `  ${randomBytes(12).toString('base64url')}:p@ss/%?#  `;
    const secretFile = path.join(temporary, 'password');
    const childFile = path.join(temporary, 'child.cjs');
    await fs.writeFile(secretFile, `${normalizedPassword}\r\n`);
    await fs.writeFile(childFile, `
const { createHash } = require('node:crypto');
console.log(JSON.stringify({
  urlSha256: createHash('sha256').update(process.env.DATABASE_URL).digest('hex'),
  argv: process.argv.slice(2),
}));
`);
    const result = docker([
      'run', '--rm', '--entrypoint', 'node',
      '-v', `${path.join(scriptsRoot, wrapper.script)}:/wrapper.cjs:ro`,
      '-v', `${secretFile}:${wrapper.secretTarget}:ro`,
      '-v', `${childFile}:${wrapper.childTarget}:ro`,
      'node:20-slim', '/wrapper.cjs', ...wrapper.childArgs,
    ]);
    assertDockerSuccess(result, `${wrapper.name} secret parser`);
    const expectedUrl = `postgresql://${wrapper.role}:${encodeURIComponent(normalizedPassword)}@postgres:5432/consensus`;
    const payload = JSON.parse(result.stdout.trim()) as { urlSha256: string; argv: string[] };
    assert.equal(payload.urlSha256, createHash('sha256').update(expectedUrl).digest('hex'));
    assert.deepEqual(payload.argv, wrapper.childArgs);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.equal(output.includes(normalizedPassword), false);
    assert.equal(output.includes('postgresql://'), false);
  });

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    test(`${wrapper.name} wrapper returns the standard interruption exit code for child ${signal}`, async (t) => {
      const temporary = await fs.mkdtemp(path.join(os.tmpdir(), `postgres-${wrapper.name}-${signal.toLowerCase()}-`));
      const container = `consensus-${wrapper.name}-${signal.toLowerCase()}-${randomBytes(5).toString('hex')}`;
      t.after(async () => {
        docker(['rm', '-f', container]);
        await fs.rm(temporary, { recursive: true, force: true });
      });
      const password = `  ${randomBytes(12).toString('base64url')}:p@ss/%?#  `;
      const secretFile = path.join(temporary, 'password');
      const childFile = path.join(temporary, 'child.cjs');
      const readyFile = path.join(temporary, 'ready');
      await fs.writeFile(secretFile, `${password}\n`);
      await fs.writeFile(childFile, `
require('node:fs').writeFileSync('/output/ready', 'ready');
setInterval(() => {}, 1000);
`);
      const created = docker([
        'create', '--name', container, '--entrypoint', 'node',
        '-v', `${path.join(scriptsRoot, wrapper.script)}:/wrapper.cjs:ro`,
        '-v', `${secretFile}:${wrapper.secretTarget}:ro`,
        '-v', `${childFile}:${wrapper.childTarget}:ro`,
        '-v', `${temporary}:/output`,
        'node:20-slim', '/wrapper.cjs', ...wrapper.childArgs,
      ]);
      assertDockerSuccess(created, `${wrapper.name} ${signal} container create`);
      assertDockerSuccess(docker(['start', container]), `${wrapper.name} ${signal} container start`);
      await waitForFile(readyFile);
      assertDockerSuccess(docker(['kill', '--signal', signal, container]), `${wrapper.name} ${signal} delivery`);
      const waited = docker(['wait', container]);
      assertDockerSuccess(waited, `${wrapper.name} ${signal} wait`);
      assert.equal(Number(waited.stdout.trim()), signal === 'SIGTERM' ? 143 : 130);
      const logs = docker(['logs', container]);
      assertDockerSuccess(logs, `${wrapper.name} ${signal} logs`);
      const output = `${logs.stdout}\n${logs.stderr}`;
      assert.equal(output.includes(password), false);
      assert.equal(output.includes('postgresql://'), false);
    });
  }
}

test('role bootstrap removes one terminal CRLF and preserves surrounding spaces and punctuation', async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'postgres-role-secret-contract-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const appPassword = `  ${randomBytes(12).toString('base64url')}:app/%?#  `;
  const migratorPassword = `  ${randomBytes(12).toString('base64url')}:migrator/%?#  `;
  const appSecret = path.join(temporary, 'app-password');
  const migratorSecret = path.join(temporary, 'migrator-password');
  const fakePsql = path.join(temporary, 'psql');
  const pgdata = path.join(temporary, 'pgdata');
  const output = path.join(temporary, 'output');
  await Promise.all([fs.mkdir(pgdata), fs.mkdir(output)]);
  await fs.writeFile(appSecret, `${appPassword}\r\n`);
  await fs.writeFile(migratorSecret, `${migratorPassword}\r\n`);
  await fs.writeFile(fakePsql, `#!/bin/sh
set -eu
printf '%s' "$POSTGRES_APP_ROLE_PASSWORD" > /output/app
printf '%s' "$POSTGRES_MIGRATOR_ROLE_PASSWORD" > /output/migrator
cat >/dev/null
`);
  const result = docker([
    'run', '--rm', '--entrypoint', 'sh',
    '-v', `${path.join(scriptsRoot, 'init-production-roles.sh')}:/init.sh:ro`,
    '-v', `${fakePsql}:/test-bin/psql:ro`,
    '-v', `${appSecret}:/run/secrets/postgres_app_password:ro`,
    '-v', `${migratorSecret}:/run/secrets/postgres_migrator_password:ro`,
    '-v', `${pgdata}:/pgdata`,
    '-v', `${output}:/output`,
    '-e', 'PATH=/test-bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    '-e', 'POSTGRES_USER=consensus_bootstrap',
    '-e', 'POSTGRES_DB=consensus',
    '-e', 'PGDATA=/pgdata',
    'postgres:16-alpine', '/init.sh',
  ]);
  assertDockerSuccess(result, 'role bootstrap password parser');
  assert.equal(await fs.readFile(path.join(output, 'app'), 'utf8'), appPassword);
  assert.equal(await fs.readFile(path.join(output, 'migrator'), 'utf8'), migratorPassword);
  const logs = `${result.stdout}\n${result.stderr}`;
  assert.equal(logs.includes(appPassword), false);
  assert.equal(logs.includes(migratorPassword), false);
});
