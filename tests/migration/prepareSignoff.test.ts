import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { hashFile } from '../../packages/db-migrator/src/backup/manifest';
import { runPrepareSignoff } from '../../packages/db-migrator/src/commands/prepare-signoff';
import { runRestoreDrill } from '../../packages/db-migrator/src/commands/restore-drill';
import { runVerifyBackup } from '../../packages/db-migrator/src/commands/verify-backup';
import { loadReleaseEvidence } from '../../packages/db-migrator/src/release/evidence';
import type { ReadinessReport } from '../../packages/db-migrator/src/reporting/reportTypes';
import { createBackupFixture } from './backupRestoreFixture';

const RELEASE_CANDIDATE = '0123456789abcdef0123456789abcdef01234567';

test('prepare-signoff builds a pending stable closure over a real 296+ restore artifact that release evidence can load', async (t) => {
  const fixture = await createBackupFixture(t);
  const verify = await runVerifyBackup({
    runId: 'prepare-verify', backupDirectory: fixture.root,
    manifestPath: fixture.manifestPath, outputDirectory: fixture.output,
  });
  assert.equal(verify.status, 'passed');
  const restore = await runRestoreDrill({
    runId: 'prepare-restore', backupDirectory: fixture.root,
    manifestPath: fixture.manifestPath, outputDirectory: fixture.output,
    restoreDirectory: path.join(fixture.output, 'prepare-restored'),
    resourceMap: [
      { sourceIndex: 0, destination: 'resources-a' },
      { sourceIndex: 1, destination: 'resources-b' },
    ],
    execute: true,
  });
  assert.equal(restore.status, 'passed');

  const executedPath = path.join(fixture.output, 'executed-backup.json');
  const rawMain = path.join(fixture.root, 'sqlite-raw', 'source.sqlite');
  const executed: ReadinessReport = {
    runId: 'backup-fixture', stage: 'backup', status: 'passed',
    startedAt: '2026-08-10T00:00:00.000Z', finishedAt: '2026-08-10T00:00:01.000Z', durationMs: 1000,
    checks: [{ id: 'backup.execute', status: 'passed', message: 'executed' }],
    artifacts: [
      { type: 'backup', path: path.relative(fixture.output, rawMain).split(path.sep).join('/'), sha256: await hashFile(rawMain) },
      { type: 'manifest', path: path.relative(fixture.output, fixture.manifestPath).split(path.sep).join('/'), sha256: await hashFile(fixture.manifestPath) },
    ],
    errors: [],
  };
  await fs.writeFile(executedPath, `${JSON.stringify(executed, null, 2)}\n`);
  const reportPaths = [
    executedPath,
    path.join(fixture.output, 'prepare-verify-backup.json'),
    path.join(fixture.output, 'prepare-restore-backup.json'),
  ];

  const prepared = await runPrepareSignoff({
    runId: 'prepare-signoff-e2e', releaseCandidate: RELEASE_CANDIDATE,
    reportPaths, outputDirectory: fixture.temporary,
    goLiveOwner: 'REPLACE_WITH_GO_LIVE_OWNER', rollbackOwner: 'REPLACE_WITH_ROLLBACK_OWNER',
  });

  assert.equal(prepared.report.status, 'passed');
  const draft = JSON.parse(await fs.readFile(prepared.draftPath, 'utf8'));
  assert.equal(draft.status, 'pending');
  assert.equal(draft.approved, false);
  assert.ok(draft.checks.every((check: { status: string }) => check.status === 'failed'));
  const longRestored = restore.artifacts.find((artifact) => artifact.path.includes('payload.json'))!;
  const longAbsolute = path.join(fixture.output, ...longRestored.path.split('/'));
  assert.ok(longAbsolute.length >= 296);
  assert.ok(draft.reportManifest.some((entry: { path: string }) => (
    path.resolve(fixture.temporary, ...entry.path.split('/')) === longAbsolute
  )));

  Object.assign(draft, {
    status: 'approved', approved: true, approvedBy: 'independent-operator',
    approvedAt: '2026-08-10T02:00:00.000Z',
  });
  draft.goLiveOwner = { name: 'go-live-owner', approvedAt: '2026-08-10T01:00:00.000Z' };
  draft.rollbackOwner = { name: 'rollback-owner', approvedAt: '2026-08-10T01:01:00.000Z' };
  draft.checks = draft.checks.map((check: { id: string }) => ({ id: check.id, status: 'passed' }));
  const approvedPath = path.join(fixture.temporary, 'operator-signoff.json');
  await fs.writeFile(approvedPath, `${JSON.stringify(draft, null, 2)}\n`);

  const loaded = await loadReleaseEvidence(reportPaths, approvedPath);
  assert.equal(loaded.reports.length, 3);
  assert.equal(loaded.signoff.approved, true);
});
