import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { runVerifyBackup } from '../../packages/db-migrator/src/commands/verify-backup';
import { createBackupFixture, readManifest, snapshotTree } from './backupRestoreFixture';

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

test('verify-backup rejects a canonical output alias inside backup before writing any evidence', async (t) => {
  const fixture = await createBackupFixture(t);
  const alias = path.join(fixture.temporary, 'backup-alias');
  await fs.symlink(fixture.root, alias, 'junction');
  const before = await snapshotTree(fixture.root);

  await assert.rejects(
    runVerifyBackup({
      runId: 'unsafe-verify-output',
      backupDirectory: fixture.root,
      manifestPath: fixture.manifestPath,
      outputDirectory: path.join(alias, 'reports'),
    }),
    { code: 'BACKUP_VERIFY_OUTPUT_UNSAFE' },
  );

  assert.deepEqual(await snapshotTree(fixture.root), before);
});

async function mutateOnSecondRootEnumeration(
  root: string,
  mutate: () => Promise<void>,
  operation: () => Promise<unknown>,
): Promise<number> {
  const mutable = fs as unknown as { readdir: typeof fs.readdir };
  const original = mutable.readdir;
  let rootReads = 0;
  mutable.readdir = (async (candidate: Parameters<typeof fs.readdir>[0], options?: Parameters<typeof fs.readdir>[1]) => {
    if (path.resolve(String(candidate)) === path.resolve(root) && ++rootReads === 2) await mutate();
    return original(candidate, options as never);
  }) as typeof fs.readdir;
  try { await operation(); } finally { mutable.readdir = original; }
  return rootReads;
}

test('verify-backup rejects an extra file introduced after the initial complete capture', async (t) => {
  const fixture = await createBackupFixture(t);
  let report: Awaited<ReturnType<typeof runVerifyBackup>> | undefined;
  const rootReads = await mutateOnSecondRootEnumeration(
    fixture.root,
    () => fs.writeFile(path.join(fixture.root, 'late-extra.txt'), 'late'),
    async () => { report = await runVerifyBackup({
      runId: 'verify-late-extra',
      backupDirectory: fixture.root,
      manifestPath: fixture.manifestPath,
      outputDirectory: fixture.output,
    }); },
  );
  assert.ok(rootReads >= 2);
  assert.equal(report?.status, 'failed');
});

test('verify-backup rejects byte-identical replacement or deletion after an early file was captured', async (t) => {
  for (const mode of ['replace', 'delete'] as const) {
    const fixture = await createBackupFixture(t);
    const target = path.join(fixture.root, 'sqlite-consistent.sqlite');
    const bytes = await fs.readFile(target);
    let report: Awaited<ReturnType<typeof runVerifyBackup>> | undefined;
    await mutateOnSecondRootEnumeration(
      fixture.root,
      async () => {
        await fs.rm(target);
        if (mode === 'replace') await fs.writeFile(target, bytes);
      },
      async () => { report = await runVerifyBackup({
        runId: `verify-late-${mode}`,
        backupDirectory: fixture.root,
        manifestPath: fixture.manifestPath,
        outputDirectory: fixture.output,
      }); },
    );
    assert.equal(report?.status, 'failed', mode);
  }
});
