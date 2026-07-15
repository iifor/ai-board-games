import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(__dirname, '../..');

test('Docker health checks use the real unauthenticated health route', () => {
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');

  assert.match(dockerfile, /\/api\/toc\/health/);
  assert.match(compose, /\/api\/toc\/health/);
  assert.doesNotMatch(dockerfile, /\/api\/toc\/games/);
  assert.doesNotMatch(compose, /\/api\/toc\/games/);
});
