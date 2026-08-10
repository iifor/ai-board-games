import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

interface SkippedTestLocation {
  file: string;
  line: number;
}

function scanForSkippedTests(entries: string[]): SkippedTestLocation[] {
  const files = entries.flatMap((entry) => {
    if (!statSync(entry).isDirectory()) return [entry];
    return readdirSync(entry, { recursive: true, withFileTypes: true })
      .filter((item) => item.isFile())
      .map((item) => path.join(item.parentPath, item.name));
  });

  return files.flatMap((file) => readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .flatMap((line, index) => /\b(?:test|it|describe)\.skip\s*\(/.test(line)
      ? [{
        file: path.relative(process.cwd(), file).replaceAll('\\', '/'),
        line: index + 1,
      }]
      : []));
}

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

test('critical database paths contain no skipped tests', () => {
  const criticalFiles = [
    'tests/postgres',
    'tests/unit/authFirstPasswordChange.test.ts',
    'tests/unit/authLoginRateLimit.test.ts',
    'tests/unit/gameSocketSession.test.ts',
    'tests/unit/playerModelFallback.test.ts',
    'tests/unit/undercoverGameRunner.test.ts',
    'tests/unit/werewolfActionEngineBridge.test.ts',
    'tests/unit/werewolfActionSpeech.test.ts',
    'tests/unit/werewolfPromptContext.test.ts',
  ];
  const skippedTests = scanForSkippedTests(criticalFiles);

  assert.equal(
    skippedTests.length,
    0,
    `critical database paths contain skipped tests:\n${skippedTests
      .map(({ file, line }) => `${file}:${line}`)
      .join('\n')}`,
  );
});
