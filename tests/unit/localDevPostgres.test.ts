import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(__dirname, '../..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('local development PostgreSQL is isolated from production resources', () => {
  const compose = read('docker-compose.dev.yml');

  assert.match(compose, /image:\s*postgres:16-alpine/);
  assert.match(compose, /127\.0\.0\.1:5432:5432/);
  assert.match(compose, /POSTGRES_DB:\s*consensus_local_v2/);
  assert.match(compose, /POSTGRES_USER:\s*consensus_dev/);
  assert.match(compose, /POSTGRES_HOST_AUTH_METHOD:\s*trust/);
  assert.match(compose, /consensus-postgres-dev-data/);
  assert.doesNotMatch(compose, /consensus-postgres-data(?:\s|$)/);
  assert.doesNotMatch(compose, /secrets:/);
  assert.doesNotMatch(compose, /^\s*-\s*["']?5432:5432["']?\s*$/m);
});

test('pnpm dev starts the healthy local database before existing services', () => {
  const launcher = read('scripts/dev/run-local.cjs');
  const packageJson = JSON.parse(read('package.json'));

  assert.equal(packageJson.scripts.dev, 'node ./scripts/dev/run-local.cjs');
  assert.equal(packageJson.scripts['dev:services'], 'pnpm -r --parallel run dev');
  assert.equal(packageJson.scripts['dev:db'], 'node ./scripts/dev/run-local.cjs --database-only');
  assert.match(launcher, /docker-compose\.dev\.yml/);
  assert.match(launcher, /'up', '-d', '--wait'/);
  assert.match(launcher, /postgresql:\/\/consensus_dev@127\.0\.0\.1:5432\/consensus_local_v2/);
  assert.match(launcher, /DATABASE_SCHEMA:\s*'consensus'/);
  assert.match(launcher, /DATABASE_SSL:\s*'false'/);
  assert.match(launcher, /CREATE SCHEMA IF NOT EXISTS consensus AUTHORIZATION consensus_dev/);
  assert.match(launcher, /process\.argv\.includes\('--database-only'\)/);
  assert.match(launcher, /\['run', 'dev:services'\]/);
});
