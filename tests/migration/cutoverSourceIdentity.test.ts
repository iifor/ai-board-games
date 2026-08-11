import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { hashFile } from '../../packages/db-migrator/src/backup/manifest';
import { openVerifiedCutoverSource } from '../../packages/db-migrator/src/cutover/sourceIdentity';
import { runCutoverValidation } from '../../packages/db-migrator/src/cutover/validation';
import type { ReadinessReport } from '../../packages/db-migrator/src/reporting/reportTypes';
import type { MigrationReport } from '../../packages/db-migrator/src/types';

function createDatabase(candidate: string, marker: string): void {
  const sqlite = new Database(candidate);
  sqlite.exec('CREATE TABLE source_identity (marker TEXT NOT NULL)');
  sqlite.prepare('INSERT INTO source_identity (marker) VALUES (?)').run(marker);
  sqlite.close();
}

test('verified cutover source keeps one immutable SQLite handle and rejects a path swap', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cutover-source-identity-'));
  let verified: Awaited<ReturnType<typeof openVerifiedCutoverSource>> | undefined;
  t.after(async () => {
    verified?.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const sourcePath = path.join(root, 'sqlite-consistent.sqlite');
  const movedPath = path.join(root, 'verified-original.sqlite');
  createDatabase(sourcePath, 'verified');
  const expectedSha256 = await hashFile(sourcePath);
  const opened = await openVerifiedCutoverSource(sourcePath, expectedSha256);
  verified = opened;

  assert.equal(opened.database.prepare('SELECT marker FROM source_identity').pluck().get(), 'verified');
  try {
    await fs.rename(sourcePath, movedPath);
    createDatabase(sourcePath, 'replacement');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EBUSY') throw error;
    const changed = new Date(Date.now() + 5_000);
    await fs.utimes(sourcePath, changed, changed);
  }

  assert.equal(opened.database.prepare('SELECT marker FROM source_identity').pluck().get(), 'verified');
  await assert.rejects(opened.assertUnchanged(), (error: unknown) => (
    (error as { code?: string }).code === 'CUTOVER_SOURCE_INVALID'
  ));
});

test('formal cutover validation borrows the held verified handle without reopening its path', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cutover-validation-source-'));
  const sourcePath = path.join(root, 'sqlite-consistent.sqlite');
  const movedPath = path.join(root, 'verified-original.sqlite');
  createDatabase(sourcePath, 'verified');
  const verified = await openVerifiedCutoverSource(sourcePath, await hashFile(sourcePath));
  t.after(async () => {
    verified.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const migration: MigrationReport = {
    status: 'succeeded', sourcePath: '[verified-consistent-snapshot]', targetSchema: 'consensus',
    startedAt: '2026-08-11T00:00:00.000Z', durationMs: 1, tables: {}, skippedTables: [],
    errors: [], validation: 'passed',
  };
  let validationInvoked = false;
  let swapped = false;
  const expectedReport: ReadinessReport = {
    runId: 'borrowed-validation-source', schema: 'consensus', stage: 'validation', status: 'passed',
    startedAt: '2026-08-11T00:00:00.000Z', finishedAt: '2026-08-11T00:00:01.000Z', durationMs: 1,
    checks: [], artifacts: [], errors: [],
  };

  const result = await runCutoverValidation({
    runId: expectedReport.runId,
    sourceSnapshotPath: sourcePath,
    sourceManifestPath: path.join(root, 'manifest.json'),
    migrationReportPath: path.join(root, 'ignored-migration.json'),
    targetUrl: 'postgresql://localhost/unused',
    targetSchema: 'consensus',
    outputDirectory: root,
    migration,
    ca: 'unused-ca',
    sourceDatabase: verified.database,
  }, {
    runValidation: async (options, dependencies) => {
      validationInvoked = true;
      try {
        await fs.rename(sourcePath, movedPath);
        createDatabase(sourcePath, 'replacement');
        swapped = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EBUSY') throw error;
      }
      const borrowed = dependencies.createSqlite!(options.sourceSnapshotPath);
      assert.equal(borrowed.prepare('SELECT marker FROM source_identity').pluck().get(), 'verified');
      borrowed.close();
      assert.equal(verified.database.prepare('SELECT marker FROM source_identity').pluck().get(), 'verified');
      if (swapped) {
        await fs.rm(sourcePath);
        await fs.rename(movedPath, sourcePath);
      }
      return expectedReport;
    },
  });

  assert.equal(validationInvoked, true, 'cutover wrapper must inject the borrowed source into formal validation');
  assert.equal(result.status, 'passed');
  await verified.assertUnchanged();
  assert.equal(swapped || process.platform === 'win32', true, 'swap must succeed or be blocked by the held Windows handle');
});
