import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { captureStableFile } from '../../packages/db-migrator/src/backup/fileSnapshot';
import { runVerifyBackup } from '../../packages/db-migrator/src/commands/verify-backup';
import { runRestoreDrill } from '../../packages/db-migrator/src/commands/restore-drill';
import { createBackupFixture } from './backupRestoreFixture';

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
