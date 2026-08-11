import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { hashFile } from '../../packages/db-migrator/src/backup/manifest';
import { openVerifiedCutoverSource } from '../../packages/db-migrator/src/cutover/sourceIdentity';

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
