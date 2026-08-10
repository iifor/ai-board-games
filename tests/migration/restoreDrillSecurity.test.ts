import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { runRestoreDrill, type RestoreDrillOptions } from '../../packages/db-migrator/src/commands/restore-drill';
import { assertExactRestoredFileSet } from '../../packages/db-migrator/src/restore/copyVerified';
import { createBackupFixture, replaceManifest } from './backupRestoreFixture';

function options(
  fixture: Awaited<ReturnType<typeof createBackupFixture>>,
  runId: string,
  overrides: Partial<RestoreDrillOptions> = {},
): RestoreDrillOptions {
  return {
    runId,
    backupDirectory: fixture.root,
    manifestPath: fixture.manifestPath,
    outputDirectory: fixture.output,
    restoreDirectory: path.join(fixture.output, 'r'),
    resourceMap: [
      { sourceIndex: 0, destination: 'resources-a' },
      { sourceIndex: 1, destination: 'resources-b' },
    ],
    execute: true,
    ...overrides,
  };
}

test('restore-drill rejects and preserves a nonempty target', async (t) => {
  const fixture = await createBackupFixture(t);
  const restore = path.join(fixture.output, 'r');
  await fs.mkdir(restore, { recursive: true });
  const sentinel = path.join(restore, 'keep.txt');
  await fs.writeFile(sentinel, 'foreign');

  const report = await runRestoreDrill(options(fixture, 'restore-nonempty'));

  assert.equal(report.status, 'failed');
  assert.equal(report.errors[0]?.code, 'RESTORE_TARGET_NOT_EMPTY');
  assert.equal(await fs.readFile(sentinel, 'utf8'), 'foreign');
});

test('restore-drill rejects incomplete, duplicate, escaping, and overlapping resource mappings', async (t) => {
  const fixture = await createBackupFixture(t);
  const maps = [
    [{ sourceIndex: 0, destination: 'a' }],
    [{ sourceIndex: 0, destination: 'a' }, { sourceIndex: 0, destination: 'b' }],
    [{ sourceIndex: 0, destination: '../a' }, { sourceIndex: 1, destination: 'b' }],
    [{ sourceIndex: 0, destination: 'a' }, { sourceIndex: 1, destination: 'a/b' }],
  ];
  for (let index = 0; index < maps.length; index += 1) {
    const report = await runRestoreDrill(options(fixture, `restore-map-${index}`, {
      restoreDirectory: path.join(fixture.output, `r${index}`),
      resourceMap: maps[index],
      execute: false,
    }));
    assert.equal(report.status, 'failed');
    assert.equal(await fs.access(fixture.output).then(() => true, () => false), false);
  }
});

test('restore-drill fails raw corruption even when the consistent copy and manifest are healthy', async (t) => {
  const fixture = await createBackupFixture(t);
  const raw = path.join(fixture.root, 'sqlite-raw', 'source.sqlite');
  await fs.writeFile(raw, Buffer.from('not-a-sqlite-database'));
  fixture.manifestPath = await replaceManifest(fixture.root);

  const report = await runRestoreDrill(options(fixture, 'restore-corrupt-raw'));

  assert.equal(report.status, 'failed');
  assert.ok(report.errors[0]?.code.startsWith('RESTORE_SQLITE'));
  await fs.access(path.join(fixture.output, 'r', 'sqlite-raw', 'source.sqlite'));
  await fs.access(path.join(fixture.output, 'r', '.restore-owner'));
  await fs.access(path.join(fixture.output, 'restore-corrupt-raw-backup.json'));
});

test('restore-drill concurrent claim permits at most one writer and never overwrites restored bytes', async (t) => {
  const fixture = await createBackupFixture(t);
  const restoreDirectory = path.join(fixture.output, 'r');
  await fs.mkdir(restoreDirectory, { recursive: true });
  const [left, right] = await Promise.all([
    runRestoreDrill(options(fixture, 'restore-concurrent-a', { restoreDirectory })),
    runRestoreDrill(options(fixture, 'restore-concurrent-b', { restoreDirectory })),
  ]);
  const passed = [left, right].filter((report) => report.status === 'passed');
  assert.equal(passed.length, 1);
  assert.equal(await fs.readFile(path.join(restoreDirectory, 'resources-b', 'asset.txt'), 'utf8'), 'resource-1\n');
});

test('exact restored file-set verification rejects unmanifested destination files', async (t) => {
  const fixture = await createBackupFixture(t);
  const restoreDirectory = path.join(fixture.output, 'r');
  const restoreOptions = options(fixture, 'restore-exact-set', { restoreDirectory });
  const report = await runRestoreDrill(restoreOptions);
  assert.equal(report.status, 'passed');
  await fs.writeFile(path.join(restoreDirectory, 'unexpected.txt'), 'foreign');

  await assert.rejects(
    assertExactRestoredFileSet(restoreDirectory, [
      'manifest.json',
      'sqlite-consistent.sqlite',
      'sqlite-raw/source.sqlite',
      `resources-a/${fixture.longRelativePath.replace(/^resources\/resource-000\//, '')}`,
      'resources-b/asset.txt',
    ]),
    { code: 'RESTORE_DESTINATION_MISMATCH' },
  );
});

test('restore-drill refuses backup, report, repository, and known production resource roots as targets', async (t) => {
  const fixture = await createBackupFixture(t);
  const repoRoot = path.resolve(__dirname, '../..');
  const targets = [
    fixture.root,
    fixture.output,
    repoRoot,
    path.join(repoRoot, 'packages', 'data'),
    path.join(repoRoot, 'packages', 'server', 'resources'),
  ];
  for (let index = 0; index < targets.length; index += 1) {
    const report = await runRestoreDrill(options(fixture, `restore-target-${index}`, {
      restoreDirectory: targets[index],
      execute: false,
    }));
    assert.equal(report.status, 'failed');
  }
});

test('restore-drill never overwrites an existing report for the same run', async (t) => {
  const fixture = await createBackupFixture(t);
  const first = options(fixture, 'restore-no-overwrite');
  await runRestoreDrill(first);
  const reportPath = path.join(fixture.output, 'restore-no-overwrite-backup.json');
  const before = await fs.readFile(reportPath);
  const second = { ...first, restoreDirectory: path.join(fixture.output, 'r2') };
  await assert.rejects(runRestoreDrill(second), { code: 'REPORT_ALREADY_EXISTS' });
  assert.deepEqual(await fs.readFile(reportPath), before);
});
