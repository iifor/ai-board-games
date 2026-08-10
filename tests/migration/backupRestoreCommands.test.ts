import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { captureStableFile } from '../../packages/db-migrator/src/backup/fileSnapshot';
import { runVerifyBackup } from '../../packages/db-migrator/src/commands/verify-backup';
import { runRestoreDrill } from '../../packages/db-migrator/src/commands/restore-drill';
import { createBackupFixture, readManifest, replaceWithWalWithoutShm } from './backupRestoreFixture';

test('verify-backup validates a published backup containing a 296+ character resource path', async (t) => {
  const fixture = await createBackupFixture(t);
  assert.ok(path.join(fixture.root, ...fixture.longRelativePath.split('/')).length >= 296);

  const report = await runVerifyBackup({
    runId: 'verify-long-path',
    backupDirectory: fixture.root,
    manifestPath: fixture.manifestPath,
    outputDirectory: fixture.output,
  });

  assert.equal(report.status, 'passed');
  assert.equal(report.checks.find((check) => check.id === 'backup.verify-manifest')?.status, 'passed');
  await fs.access(path.join(fixture.output, 'verify-long-path-backup.json'));
});

test('restore-drill dry-run writes nothing and execute restores raw, consistent, and every mapped resource root', async (t) => {
  const fixture = await createBackupFixture(t);
  const restoreRoot = path.join(fixture.output, 'r');
  const resourceMap = [
    { sourceIndex: 0, destination: 'resources-a' },
    { sourceIndex: 1, destination: 'resources-b' },
  ];

  const dryRun = await runRestoreDrill({
    runId: 'restore-dry-run',
    backupDirectory: fixture.root,
    manifestPath: fixture.manifestPath,
    outputDirectory: fixture.output,
    restoreDirectory: restoreRoot,
    resourceMap,
    execute: false,
  });
  assert.equal(dryRun.status, 'passed');
  assert.equal(dryRun.checks.find((check) => check.id === 'backup.restore-drill')?.status, 'skipped');
  await assert.rejects(fs.access(fixture.output), { code: 'ENOENT' });

  const executed = await runRestoreDrill({
    runId: 'restore-execute',
    backupDirectory: fixture.root,
    manifestPath: fixture.manifestPath,
    outputDirectory: fixture.output,
    restoreDirectory: restoreRoot,
    resourceMap,
    execute: true,
  });
  assert.equal(executed.status, 'passed');
  assert.equal(executed.checks.find((check) => check.id === 'backup.restore-drill')?.status, 'passed');
  assert.equal(await fs.readFile(path.join(restoreRoot, 'resources-b', 'asset.txt'), 'utf8'), 'resource-1\n');
  await fs.access(path.join(restoreRoot, 'sqlite-raw', 'source.sqlite'));
  await fs.access(path.join(restoreRoot, 'sqlite-consistent.sqlite'));
  await fs.access(path.join(restoreRoot, 'manifest.json'));
  await assert.rejects(fs.access(path.join(restoreRoot, '.restore-owner')), { code: 'ENOENT' });
  const ownerArtifacts = executed.artifacts.filter((artifact) => artifact.type === 'evidence' && artifact.path.includes('restore-owner'));
  assert.equal(ownerArtifacts.length, 1);
  await fs.access(path.join(fixture.output, ...ownerArtifacts[0].path.split('/')));
});

test('restore-drill verifies a WAL-without-SHM rollback set without opening or mutating final restored files', async (t) => {
  const fixture = await createBackupFixture(t);
  await replaceWithWalWithoutShm(fixture);
  const manifest = await readManifest(fixture.manifestPath);
  assert.ok(manifest.entries.some((entry) => entry.path === 'sqlite-raw/source.sqlite-wal'));
  assert.ok(!manifest.entries.some((entry) => entry.path === 'sqlite-raw/source.sqlite-shm'));
  const restoreRoot = path.join(fixture.output, 'wal-restore');

  const report = await runRestoreDrill({
    runId: 'restore-wal-without-shm',
    backupDirectory: fixture.root,
    manifestPath: fixture.manifestPath,
    outputDirectory: fixture.output,
    restoreDirectory: restoreRoot,
    resourceMap: [
      { sourceIndex: 0, destination: 'resources-a' },
      { sourceIndex: 1, destination: 'resources-b' },
    ],
    execute: true,
  });

  assert.equal(report.status, 'passed');
  await assert.rejects(fs.access(path.join(restoreRoot, 'sqlite-raw', 'source.sqlite-shm')), { code: 'ENOENT' });
  for (const name of ['source.sqlite', 'source.sqlite-wal']) {
    const entry = manifest.entries.find((candidate) => candidate.path === `sqlite-raw/${name}`)!;
    const restored = await captureStableFile(
      path.join(restoreRoot, 'sqlite-raw', name),
      await fs.realpath(restoreRoot),
      entry.path,
      'TEST_RESTORED_FILE',
    );
    assert.equal(restored.sha256, entry.sha256);
    assert.equal(restored.sizeBytes, entry.sizeBytes);
  }
});

test('stable backup hashing streams a large file without FileHandle.readFile', async (t) => {
  const fixture = await createBackupFixture(t);
  const candidate = path.join(fixture.root, 'large-controlled.bin');
  const writer = await fs.open(candidate, 'wx');
  await writer.truncate(32 * 1024 * 1024);
  await writer.close();
  const rootRealPath = await fs.realpath(fixture.root);
  const probe = await fs.open(candidate, 'r');
  const prototype = Object.getPrototypeOf(probe) as { readFile: (...args: unknown[]) => Promise<Buffer> };
  await probe.close();
  const original = prototype.readFile;
  prototype.readFile = async () => { throw new Error('whole-file reads are forbidden'); };
  t.after(() => { prototype.readFile = original; });

  const captured = await captureStableFile(candidate, rootRealPath, 'large-controlled.bin', 'TEST_STABLE_FILE');

  assert.equal(captured.sizeBytes, 32 * 1024 * 1024);
  assert.match(captured.sha256, /^[a-f0-9]{64}$/);
});
