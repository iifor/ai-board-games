import { promises as fs } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { captureStableFile, copyStableFile } from './fileSnapshot';
import { pathExists } from './publication';

const WINDOWS_SQLITE_MAX_PATH_LENGTH = 259;

function codedError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

export function assertSqlitePathBudget(candidates: string[]): void {
  if (process.platform !== 'win32') return;
  if (candidates.some((candidate) => path.resolve(candidate).length > WINDOWS_SQLITE_MAX_PATH_LENGTH)) {
    throw codedError('BACKUP_PATH_TOO_LONG', 'Backup output path is too long for SQLite recovery');
  }
}

export async function createConsistentDatabase(rawRoot: string, stagingRoot: string): Promise<string> {
  const recoveryRoot = path.join(stagingRoot, '.sqlite-recovery');
  const recoverySource = path.join(recoveryRoot, 'source.sqlite');
  const consistentPath = path.join(stagingRoot, 'sqlite-consistent.sqlite');
  assertSqlitePathBudget([recoverySource, consistentPath]);
  await fs.mkdir(recoveryRoot);
  const rawRealPath = await fs.realpath(rawRoot);
  try {
    for (const archiveName of ['source.sqlite', 'source.sqlite-wal']) {
      const candidate = path.join(rawRoot, archiveName);
      if (!await pathExists(candidate)) continue;
      const stable = await captureStableFile(candidate, rawRealPath, archiveName, 'STAGED_RAW_INVALID');
      await copyStableFile(stable, rawRealPath, path.join(recoveryRoot, archiveName), 'STAGED_RAW_INVALID');
    }
    const recovery = new Database(recoverySource, { fileMustExist: true });
    try { await recovery.backup(consistentPath); } finally { recovery.close(); }
    const consistent = new Database(consistentPath, { readonly: true, fileMustExist: true });
    try {
      const integrity = consistent.prepare('PRAGMA integrity_check').pluck().get();
      if (integrity !== 'ok') {
        throw codedError('CONSISTENT_DATABASE_INVALID', `Consistent SQLite integrity check returned: ${String(integrity)}`);
      }
    } finally { consistent.close(); }
    return consistentPath;
  } finally {
    await fs.rm(recoveryRoot, { recursive: true, force: true });
  }
}
