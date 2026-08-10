import Database from 'better-sqlite3';
import path from 'node:path';
import { IMPORT_TABLES } from '../constants';

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
    const queryOnly = Number(database.pragma('query_only', { simple: true }));
    if (queryOnly !== 1) throw codedError('RESTORE_SQLITE_QUERY_ONLY_FAILED');
    const integrity = String(database.prepare('PRAGMA integrity_check').pluck().get());
    if (integrity !== 'ok') throw codedError('RESTORE_SQLITE_INTEGRITY_FAILED');
    const present = new Set((database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name));
    if (!present.has('games') || !present.has('players')) throw codedError('RESTORE_SQLITE_KEY_TABLES_MISSING');
    const counts: Record<string, number> = {};
    for (const table of IMPORT_TABLES) {
      if (!present.has(table)) continue;
      counts[table] = Number(database.prepare(`SELECT COUNT(*) FROM ${quoteIdentifier(table)}`).pluck().get());
    }
    return { integrity, counts };
  } finally {
    database?.close();
  }
}

export function verifyRestoredSqlite(restoreRoot: string): SqliteRestoreVerification {
  try {
    const raw = inspectDatabase(path.join(restoreRoot, 'sqlite-raw', 'source.sqlite'));
    const consistent = inspectDatabase(path.join(restoreRoot, 'sqlite-consistent.sqlite'));
    if (JSON.stringify(raw.counts) !== JSON.stringify(consistent.counts)) {
      throw codedError('RESTORE_SQLITE_COUNT_MISMATCH');
    }
    return { rawIntegrity: raw.integrity, consistentIntegrity: consistent.integrity, counts: raw.counts };
  } catch (error) {
    if ((error as Error & { code?: string }).code?.startsWith('RESTORE_')) throw error;
    throw codedError('RESTORE_SQLITE_INVALID');
  }
}
