import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('release workflow verifies PostgreSQL before deployment', () => {
  const workflow = readFileSync('.github/workflows/deploy-master.yml', 'utf8');

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /postgres:\s*[\s\S]*image:\s*postgres:16/);
  assert.match(workflow, /^\s*run:\s*pnpm run verify:release\s*$/m);
  assert.match(workflow, /deploy:[\s\S]*needs:\s*verify/);
  assert.match(workflow, /github\.event_name != 'pull_request'/);
  assert.match(workflow, /bash -s -- '\$\{PROJECT_PATH_B64\}' '\$\{\{ github\.sha \}\}'/);
  assert.match(workflow, /DEPLOY_SHA="\$2"/);
  assert.match(workflow, /git reset --hard "\$\{DEPLOY_SHA\}"/);
  assert.doesNotMatch(workflow, /git reset --hard origin\/master/);
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
