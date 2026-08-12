import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '../..');

async function writeFixture(root: string, relativePath: string, contents = relativePath): Promise<void> {
  const target = path.join(root, ...relativePath.split('/'));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, contents);
}

test('Docker build context excludes operational evidence and SQLite files while retaining runtime inputs', async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'consensus-docker-context-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));

  const contextRoot = path.join(temporary, 'context');
  const outputRoot = path.join(temporary, 'output');
  await fs.mkdir(contextRoot, { recursive: true });
  await fs.copyFile(path.join(repoRoot, '.dockerignore'), path.join(contextRoot, '.dockerignore'));

  const requiredPaths = [
    'package.json',
    'docs/README.md',
    'packages/shared/src/index.ts',
    'packages/client/src/main.tsx',
    'packages/admin/src/main.tsx',
    'packages/server/app.ts',
    'packages/server/resources/system/required-resource.bin',
    'packages/server/resources/system/UPPER.SQLITE.md',
    'packages/server/resources/system/plain-wal.txt',
    'packages/server/resources/system/plain-shm.json',
    'packages/server/resources/system/plain-journal.svg',
    'packages/server/resources/system/release.DUMP-notes.txt',
    'packages/server/resources/system/database.BACKUP-policy.md',
    'packages/server/resources/system/runtime.LOGO.svg',
    'packages/server/resources/system/UPPER.TMP.md',
    'packages/server/resources/system/docs/schema.SQLITE-notes.txt',
    'packages/server/resources/system/docs/schema.sqlite-template.json',
    'packages/server/resources/system/docs/database.DB-guide.md',
    'packages/server/resources/system/docs/database.db-schema.yaml',
  ];
  const sensitivePaths = [
    'artifacts/postgres-readiness/rehearsal-report.json',
    '.superpowers/sdd/private-evidence.txt',
    '.worktrees/parallel/artifacts/backup.dump',
    'packages/data/ai-presenter.sqlite',
    'packages/data/ai-presenter.sqlite-wal',
    'packages/data/ai-presenter.sqlite-shm',
    'packages/data/ai-presenter.sqlite-journal',
    'packages/server/tmp/accidental.sqlite',
    'packages/server/resources/system/accidental.db',
    'packages/server/resources/system/accidental.db-wal',
    'packages/server/resources/system/accidental.dump',
    'packages/server/resources/system/accidental.backup',
    'packages/server/resources/system/accidental.bak',
    'packages/server/resources/system/UPPER.SQLITE',
    'packages/server/resources/system/UPPER.SQLITE-WAL',
    'packages/server/resources/system/UPPER.SQLITE-SHM',
    'packages/server/resources/system/UPPER.SQLITE-JOURNAL',
    'packages/server/resources/system/UPPER.DB',
    'packages/server/resources/system/UPPER.DB-WAL',
    'packages/server/resources/system/UPPER.DB-SHM',
    'packages/server/resources/system/UPPER.DB-JOURNAL',
    'packages/server/resources/system/UPPER.DUMP',
    'packages/server/resources/system/UPPER.BACKUP',
    'packages/server/resources/system/UPPER.BAK',
    'packages/server/resources/system/UPPER.LOG',
    'packages/server/resources/system/plain-wal',
    'packages/server/resources/system/plain-shm',
    'packages/server/resources/system/plain-journal',
    'packages/server/resources/system/plain.tmp',
    'packages/server/resources/system/UPPER.TMP',
    'backups/production.dump',
    'reports/release-readiness.json',
    'logs/server.log',
  ];
  await Promise.all([...requiredPaths, ...sensitivePaths].map((entry) => writeFixture(contextRoot, entry)));

  const dockerfile = [
    'FROM scratch',
    'COPY . /context',
    '',
  ].join('\n');
  const build = spawnSync('docker', [
    'build',
    '--progress=plain',
    '--file=-',
    `--output=type=local,dest=${outputRoot}`,
    contextRoot,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    input: dockerfile,
    timeout: 120_000,
  });
  assert.equal(
    build.status,
    0,
    `Docker context audit failed to build:\n${build.stdout}\n${build.stderr}`,
  );

  const exportedContext = path.join(outputRoot, 'context');
  for (const entry of requiredPaths) {
    assert.equal(
      await fs.stat(path.join(exportedContext, ...entry.split('/'))).then(() => true, () => false),
      true,
      `required build input was excluded: ${entry}`,
    );
  }
  for (const entry of sensitivePaths) {
    assert.equal(
      await fs.stat(path.join(exportedContext, ...entry.split('/'))).then(() => true, () => false),
      false,
      `sensitive generated file entered Docker context: ${entry}`,
    );
  }
});

test('Docker runtime stage copies application packages only from the named candidate context', async () => {
  const dockerfile = await fs.readFile(path.join(repoRoot, 'Dockerfile'), 'utf8');
  const runtimeStage = /^FROM\s+node:20-slim\s+AS\s+runtime(?![-\w])([\s\S]*?)(?=^FROM\s|(?![\s\S]))/im.exec(dockerfile)?.[1];
  assert.ok(runtimeStage, 'Dockerfile must define the production runtime stage');

  const copyInstructions = [...runtimeStage.matchAll(/^COPY\s+(.+)$/gm)].map((match) => match[1].trim());
  const copiedSources = copyInstructions.flatMap((instruction) => {
    const operands = instruction.split(/\s+/).filter((operand) => !operand.startsWith('--'));
    return operands.slice(0, -1);
  });
  assert.ok(copyInstructions.some((instruction) => instruction === '--from=application_source packages/server ./packages/server'));
  assert.ok(copyInstructions.some((instruction) => instruction === '--from=application_source packages/shared ./packages/shared'));
  assert.ok(copyInstructions.some((instruction) => instruction.includes('--from=runtime-builder /app/dist ./dist')));
  assert.equal(
    copiedSources.some((source) => /^(?:\.|artifacts|\.superpowers|\.worktrees|packages\/db-migrator)(?:\/|$)/.test(source)),
    false,
    `runtime stage contains a broad or migration-only COPY source: ${copiedSources.join(' | ')}`,
  );
  assert.equal(copyInstructions.some((instruction) => /--from=builder .*packages\/(?:server|shared|client|admin)/.test(instruction)), false);
});
