import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('release workflow verifies PostgreSQL before deployment', () => {
  const workflow = readFileSync('.github/workflows/deploy-master.yml', 'utf8');

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /postgres:\s*[\s\S]*image:\s*postgres:16/);
  assert.match(workflow, /pnpm\.cmd? run test:postgres|pnpm run test:postgres/);
  assert.match(workflow, /deploy:[\s\S]*needs:\s*verify/);
  assert.match(workflow, /github\.event_name != 'pull_request'/);
});

test('root package exposes one complete release verification command', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };

  assert.equal(
    packageJson.scripts['verify:release'],
    'pnpm run check && pnpm run build && pnpm run test:unit && pnpm run test:workflow && pnpm run test:migration && pnpm run test:postgres',
  );
});
