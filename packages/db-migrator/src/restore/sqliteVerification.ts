import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { IMPORT_TABLES } from '../constants';
import { captureStableFile, copyStableFile, type StableFile } from '../backup/fileSnapshot';
import { cleanupOwnedTemporaryDirectory, recordOwnedTemporaryDirectory } from '../backup/ownedTemporaryDirectory';

export interface SqliteRestoreVerification {
  rawIntegrity: string;
  consistentIntegrity: string;
  counts: Record<string, number>;
}

function codedError(code: string): Error & { code: string } {
  return Object.assign(new Error('Restored SQLite verification failed'), { code });
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function inspectDatabase(candidate: string): { integrity: string; counts: Record<string, number> } {
  let database: Database.Database | undefined;
  try {
    database = new Database(candidate, { readonly: true, fileMustExist: true });
    database.pragma('query_only = ON');
    if (Number(database.pragma('query_only', { simple: true })) !== 1) {
      throw codedError('RESTORE_SQLITE_QUERY_ONLY_FAILED');
    }
    const integrity = String(database.prepare('PRAGMA integrity_check').pluck().get());
    if (integrity !== 'ok') throw codedError('RESTORE_SQLITE_INTEGRITY_FAILED');
    const present = new Set((database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name));
    if (!present.has('games') || !present.has('players')) throw codedError('RESTORE_SQLITE_KEY_TABLES_MISSING');
    const counts: Record<string, number> = {};
    for (const table of IMPORT_TABLES) {
      if (present.has(table)) counts[table] = Number(database.prepare(`SELECT COUNT(*) FROM ${quoteIdentifier(table)}`).pluck().get());
    }
    return { integrity, counts };
  } finally {
    database?.close();
  }
}

async function exists(candidate: string): Promise<boolean> {
  try { await fs.lstat(candidate); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function captureSet(
  restoreRootReal: string,
  mainPath: string,
): Promise<Array<{ source: StableFile; destinationName: string }>> {
  const files: Array<{ source: StableFile; destinationName: string }> = [];
  for (const suffix of ['', '-wal', '-shm']) {
    const candidate = `${mainPath}${suffix}`;
    if (suffix && !await exists(candidate)) continue;
    files.push({
      source: await captureStableFile(candidate, restoreRootReal, path.basename(candidate), 'RESTORE_DESTINATION_CHANGED'),
      destinationName: `source.sqlite${suffix}`,
    });
  }
  return files;
}

async function inspectPrivateCopy(
  restoreRootReal: string,
  mainPath: string,
): Promise<{ integrity: string; counts: Record<string, number> }> {
  const files = await captureSet(restoreRootReal, mainPath);
  const temporaryParent = await fs.mkdtemp(path.join(os.tmpdir(), 'dbm-rv-'));
  const owner = await recordOwnedTemporaryDirectory(temporaryParent);
  let result: { integrity: string; counts: Record<string, number> } | undefined;
  let primaryError: unknown;
  try {
    for (const file of files) {
      await copyStableFile(
        file.source,
        restoreRootReal,
        path.join(owner.path, file.destinationName),
        'RESTORE_DESTINATION_CHANGED',
      );
    }
    result = inspectDatabase(path.join(owner.path, 'source.sqlite'));
  } catch (error) {
    primaryError = error;
  }
  try {
    await cleanupOwnedTemporaryDirectory(owner, {
      rename: fs.rename,
      list: fs.readdir,
      unlink: fs.unlink,
      rmdir: fs.rmdir,
    });
  } catch {
    if (!primaryError) primaryError = codedError('RESTORE_SQLITE_TEMP_CLEANUP_FAILED');
  }
  if (primaryError) throw primaryError;
  return result!;
}

export async function verifyRestoredSqlite(restoreRoot: string): Promise<SqliteRestoreVerification> {
  try {
    const restoreRootReal = await fs.realpath(restoreRoot);
    const raw = await inspectPrivateCopy(restoreRootReal, path.join(restoreRoot, 'sqlite-raw', 'source.sqlite'));
    const consistent = await inspectPrivateCopy(restoreRootReal, path.join(restoreRoot, 'sqlite-consistent.sqlite'));
    if (JSON.stringify(raw.counts) !== JSON.stringify(consistent.counts)) {
      throw codedError('RESTORE_SQLITE_COUNT_MISMATCH');
    }
    return { rawIntegrity: raw.integrity, consistentIntegrity: consistent.integrity, counts: raw.counts };
  } catch (error) {
    if ((error as Error & { code?: string }).code?.startsWith('RESTORE_')) throw error;
    throw codedError('RESTORE_SQLITE_INVALID');
  }
}
