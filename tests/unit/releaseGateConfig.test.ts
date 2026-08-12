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

test('release workflow verifies only and never deploys over SSH or Compose', () => {
  const workflow = readFileSync('.github/workflows/deploy-master.yml', 'utf8');

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /postgres:\s*[\s\S]*image:\s*postgres:16/);
  assert.match(workflow, /^\s*run:\s*pnpm run verify:release\s*$/m);
  assert.doesNotMatch(workflow, /^\s*deploy:\s*$/m);
  assert.doesNotMatch(workflow, /\bssh\b|git reset|docker compose up/i);
  assert.match(workflow, /--build-context application_source=\./);
  assert.match(workflow, /docker build --target runtime/);
  assert.match(workflow, /\.consensus-application-inputs\.json/);
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
