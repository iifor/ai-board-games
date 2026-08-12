import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  fixture, fixedCompose, regexEscape, repoRoot, run, scripts, scriptsRoot, shellExecutable, shellPath,
} from './postgresLinuxOpsFixtures';

test('Linux PostgreSQL entrypoints are POSIX sh, syntactically valid, and contain no database implementation', async () => {
  for (const name of scripts) {
    const source = await fs.readFile(path.join(scriptsRoot, name), 'utf8');
    assert.match(source, /^#!\/bin\/sh\r?\nset -eu\r?\n/, name);
    assert.equal(spawnSync(shellExecutable(), ['-n', shellPath(path.join(scriptsRoot, name))], { encoding: 'utf8' }).status, 0, name);
    assert.doesNotMatch(source, /postgres(?:ql)?:\/\/|\bpsql\b|DROP\s+(?:SCHEMA|TABLE)|\bTRUNCATE\b|\bVACUUM\b|rm\s+-r|docker\s+compose\s+down/i, name);
    assert.doesNotMatch(source, /\bdocker\s+compose\b/, `${name} must use the fixed Compose helper`);
  }
});

test('thin migrator entrypoints use only the fixed ops profile/service and propagate the child exit', async (t) => {
  const fx = await fixture(t);
  const cases = [
    'backup-linux.sh', 'verify-backup-linux.sh', 'production-preflight-linux.sh', 'cutover-once-linux.sh',
    'restore-drill-linux.sh', 'prepare-signoff-linux.sh', 'release-readiness-linux.sh', 'verify-observation-linux.sh',
  ] as const;
  for (const name of cases) assert.equal(run(name, fx.env).status, 23, name);
  const calls = await fs.readFile(fx.capture, 'utf8');
  assert.match(calls, new RegExp(`${regexEscape(fixedCompose)} --profile ops run --rm --no-deps`));
  assert.match(calls, /--volume/);
  assert.doesNotMatch(calls, /--mount|\b(?:app|nginx)\b|postgres(?:ql)?:\/\//);
  assert.equal(calls.match(/\bmigrator cutover\b/g)?.length, 1);
  assert.doesNotMatch(calls, /\b(?:drop|truncate|delete|down)\b/i);
});

test('backup, preflight, and cutover stop before operation when the freeze validator fails', async (t) => {
  const fx = await fixture(t);
  for (const [name, forbidden] of [
    ['backup-linux.sh', /\bmigrator backup\b/],
    ['production-preflight-linux.sh', /\bmigrator preflight\b/],
    ['cutover-once-linux.sh', /\bmigrator cutover\b/],
  ] as const) {
    const result = run(name, { ...fx.env, FREEZE_VALIDATOR_EXIT: '31', OPS_EXIT: '0' });
    assert.equal(result.status, 31, `${name}: ${result.stderr}`);
    const calls = await fs.readFile(fx.capture, 'utf8');
    assert.match(calls, /migrator verify-freeze-receipt/);
    assert.doesNotMatch(calls, forbidden);
    await fs.writeFile(fx.capture, '');
  }
});

test('service entrypoints source the fixed helper and start only the named service', async (t) => {
  const fx = await fixture(t);
  for (const [name, service] of [['start-postgres-only.sh', 'postgres'], ['start-app-only.sh', 'app']] as const) {
    const result = run(name, fx.env);
    assert.equal(result.status, 23, `${name}: ${result.stderr}`);
    const calls = await fs.readFile(fx.capture, 'utf8');
    const profile = service === 'app' ? ' --profile application' : '';
    assert.match(calls, new RegExp(`${regexEscape(fixedCompose)}${profile} up -d --no-deps --wait ${service}`));
    assert.doesNotMatch(calls, /\bnginx\b/);
    if (service === 'app') assert.match(calls, /--profile application/);
    await fs.writeFile(fx.capture, '');
  }
});

test('Compose defaults to PostgreSQL and application or traffic require explicit profiles', async () => {
  const compose = await fs.readFile(path.join(repoRoot, 'docker-compose.yml'), 'utf8');
  assert.match(compose, /^  app:[\s\S]*?^    profiles: \[application\]/m);
  assert.match(compose, /^  nginx:[\s\S]*?^    profiles: \[traffic\]/m);
  assert.match(compose, /^  migrator:[\s\S]*?^    profiles: \[ops\]/m);
  assert.doesNotMatch(compose, /docker compose up -d --build/);
});

test('resolved default Compose service set contains PostgreSQL only', () => {
  const env = { ...process.env };
  for (const key of ['COMPOSE_FILE', 'COMPOSE_PROFILES', 'COMPOSE_PROJECT_NAME', 'COMPOSE_PATH_SEPARATOR']) delete env[key];
  const result = spawnSync('docker', [
    'compose', '--project-directory', repoRoot, '-f', path.join(repoRoot, 'docker-compose.yml'),
    '--project-name', 'consensus-test-default-profile', 'config', '--services',
  ], { cwd: repoRoot, env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/), ['postgres']);
});

test('container CSV rejects glob characters instead of expanding workspace entries', async (t) => {
  const fx = await fixture(t);
  const result = run('backup-linux.sh', { ...fx.env, RESOURCE_RELATIVE_PATHS: '*', OPS_EXIT: '0' });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(await fs.readFile(fx.capture, 'utf8').catch(() => ''), /verify-freeze-receipt|AGENTS\.md/);
});

test('exec-based entrypoints preserve child termination signals', async (t) => {
  const fx = await fixture(t);
  const result = run('start-app-only.sh', { ...fx.env, OPS_SIGNAL: 'TERM', OPS_EXIT: '0' });
  assert.equal(result.status === 3840 || result.status === 143 || result.signal === 'SIGTERM', true);
});

test('entrypoints do not disclose secret-looking environment values in argv or output', async (t) => {
  const fx = await fixture(t);
  const secrets = [
    ['postgresql://ops', 'password@private/consensus'].join(':'),
    'https://private/endpoint', 'CA_BYTES', 'KEY_BYTES',
  ];
  const result = run('cutover-once-linux.sh', {
    ...fx.env, DATABASE_URL: secrets[0], PRIVATE_ENDPOINT: secrets[1], DATABASE_CA_BYTES: secrets[2], TLS_PRIVATE_KEY_BYTES: secrets[3],
  });
  const observable = `${result.stdout}\n${result.stderr}\n${await fs.readFile(fx.capture, 'utf8')}`;
  for (const secret of secrets) assert.equal(observable.includes(secret), false, secret);
  assert.equal(path.resolve(repoRoot), repoRoot);
});
