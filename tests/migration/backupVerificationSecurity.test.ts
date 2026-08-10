import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { runVerifyBackup } from '../../packages/db-migrator/src/commands/verify-backup';
import { createBackupFixture, readManifest } from './backupRestoreFixture';

async function verify(t: test.TestContext, mutate: (fixture: Awaited<ReturnType<typeof createBackupFixture>>) => Promise<void>) {
  const fixture = await createBackupFixture(t);
  await mutate(fixture);
  return runVerifyBackup({
    runId: `verify-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    backupDirectory: fixture.root,
    manifestPath: fixture.manifestPath,
    outputDirectory: fixture.output,
  });
}

test('verify-backup rejects tampered, missing, and extra artifact bytes with fixed path-free errors', async (t) => {
  const cases = [
    async (root: string, relative: string) => fs.appendFile(path.join(root, ...relative.split('/')), 'tampered'),
    async (root: string, relative: string) => fs.rm(path.join(root, ...relative.split('/'))),
    async (root: string) => fs.writeFile(path.join(root, 'unexpected.txt'), 'extra'),
  ];
  for (const mutate of cases) {
    const report = await verify(t, async (fixture) => mutate(fixture.root, fixture.longRelativePath));
    assert.equal(report.status, 'failed');
    assert.equal(report.checks.at(-1)?.message, 'Backup evidence verification failed');
    assert.doesNotMatch(JSON.stringify(report), /payload\.json|unexpected\.txt|backup-restore-commands/i);
  }
});

test('verify-backup rejects duplicate and case-aliased manifest paths', async (t) => {
  for (const alias of [false, true]) {
    const report = await verify(t, async (fixture) => {
      const manifest = await readManifest(fixture.manifestPath);
      const duplicate = { ...manifest.entries[0], path: alias ? manifest.entries[0].path.toUpperCase() : manifest.entries[0].path };
      manifest.entries.push(duplicate);
      manifest.entries.sort((left, right) => left.path.localeCompare(right.path));
      await fs.writeFile(fixture.manifestPath, `${JSON.stringify(manifest)}\n`);
    });
    assert.equal(report.status, 'failed');
    assert.equal(report.errors[0]?.code, 'BACKUP_MANIFEST_DUPLICATE_PATH');
  }
});

test('verify-backup rejects an unsafe manifest identity even when every artifact matches', async (t) => {
  const report = await verify(t, async (fixture) => {
    const manifest = await readManifest(fixture.manifestPath);
    manifest.runId = '../foreign-run';
    await fs.writeFile(fixture.manifestPath, `${JSON.stringify(manifest)}\n`);
  });
  assert.equal(report.status, 'failed');
  assert.equal(report.errors[0]?.code, 'BACKUP_MANIFEST_INVALID');
});

test('verify-backup rejects a resource junction without reading outside bytes', async (t) => {
  const fixture = await createBackupFixture(t);
  const outside = path.join(fixture.temporary, 'outside');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'secret.txt'), 'outside-secret');
  const junction = path.join(fixture.root, 'resources', 'resource-002');
  await fs.symlink(outside, junction, 'junction');

  const report = await runVerifyBackup({
    runId: 'verify-junction',
    backupDirectory: fixture.root,
    manifestPath: fixture.manifestPath,
    outputDirectory: fixture.output,
  });
  assert.equal(report.status, 'failed');
  assert.equal(report.errors[0]?.code, 'BACKUP_PATH_INVALID');
  assert.doesNotMatch(JSON.stringify(report), /outside-secret|secret\.txt/);
});

test('verify-backup reports concurrent evidence mutation instead of accepting mixed bytes', async (t) => {
  const fixture = await createBackupFixture(t);
  const target = path.join(fixture.root, ...fixture.longRelativePath.split('/'));
  await fs.writeFile(target, Buffer.alloc(32 * 1024 * 1024, 7));
  const manifest = await readManifest(fixture.manifestPath);
  const entry = manifest.entries.find((item) => item.path === fixture.longRelativePath)!;
  const hash = (await import('../../packages/db-migrator/src/backup/manifest')).hashFile;
  entry.sizeBytes = 32 * 1024 * 1024;
  entry.sha256 = await hash(target);
  await fs.writeFile(fixture.manifestPath, `${JSON.stringify(manifest)}\n`);

  const pending = runVerifyBackup({
    runId: 'verify-concurrent-change',
    backupDirectory: fixture.root,
    manifestPath: fixture.manifestPath,
    outputDirectory: fixture.output,
  });
  await new Promise((resolve) => setImmediate(resolve));
  await fs.appendFile(target, Buffer.from([8]));
  const report = await pending;
  assert.equal(report.status, 'failed');
  assert.ok(['BACKUP_EVIDENCE_CHANGED', 'BACKUP_CONTENT_MISMATCH'].includes(report.errors[0]?.code));
});

test('verify-backup never overwrites an existing report for the same run', async (t) => {
  const fixture = await createBackupFixture(t);
  const options = {
    runId: 'verify-no-overwrite',
    backupDirectory: fixture.root,
    manifestPath: fixture.manifestPath,
    outputDirectory: fixture.output,
  };
  await runVerifyBackup(options);
  const reportPath = path.join(fixture.output, 'verify-no-overwrite-backup.json');
  const before = await fs.readFile(reportPath);
  await assert.rejects(runVerifyBackup(options), { code: 'REPORT_ALREADY_EXISTS' });
  assert.deepEqual(await fs.readFile(reportPath), before);
});
