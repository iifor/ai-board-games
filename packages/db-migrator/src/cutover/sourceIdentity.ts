import { promises as fs } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { captureStableFile, type StableFile } from '../backup/fileSnapshot';

export interface OpenVerifiedCutoverSource {
  database: Database.Database;
  sourcePath: string;
  sha256: string;
  assertUnchanged(): Promise<void>;
  close(): void;
}

function invalidSource(): Error & { code: 'CUTOVER_SOURCE_INVALID' } {
  return Object.assign(new Error('Verified cutover source snapshot or manifest is invalid'), {
    code: 'CUTOVER_SOURCE_INVALID' as const,
  });
}

function sourceCloseFailure(): Error & { code: 'CUTOVER_SOURCE_CLOSE_FAILED' } {
  return Object.assign(new Error('Production cutover source failed to close'), {
    code: 'CUTOVER_SOURCE_CLOSE_FAILED' as const,
  });
}

function sameIdentity(left: StableFile, right: StableFile): boolean {
  return left.dev === right.dev && left.ino === right.ino
    && left.sizeBytes === right.sizeBytes && left.mtimeNs === right.mtimeNs
    && left.sha256 === right.sha256;
}

export async function openVerifiedCutoverSource(
  candidate: string,
  expectedSha256: string,
): Promise<OpenVerifiedCutoverSource> {
  let database: Database.Database | undefined;
  try {
    const sourcePath = path.resolve(candidate);
    const rootRealPath = await fs.realpath(path.dirname(sourcePath));
    const before = await captureStableFile(
      sourcePath, rootRealPath, path.basename(sourcePath), 'CUTOVER_SOURCE_INVALID',
    );
    if (before.sha256 !== expectedSha256) throw invalidSource();
    database = new Database(sourcePath, { readonly: true, fileMustExist: true });
    database.pragma('query_only = ON');
    database.exec('BEGIN');
    database.prepare('SELECT COUNT(*) FROM sqlite_schema').pluck().get();
    const afterOpen = await captureStableFile(
      sourcePath, rootRealPath, path.basename(sourcePath), 'CUTOVER_SOURCE_INVALID',
    );
    if (!sameIdentity(before, afterOpen)) throw invalidSource();
    const opened = database;
    let closed = false;
    return {
      database: opened,
      sourcePath,
      sha256: before.sha256,
      async assertUnchanged() {
        try {
          const current = await captureStableFile(
            sourcePath, rootRealPath, path.basename(sourcePath), 'CUTOVER_SOURCE_INVALID',
          );
          if (!sameIdentity(before, current)) throw invalidSource();
        } catch {
          throw invalidSource();
        }
      },
      close() {
        if (closed) return;
        closed = true;
        let failed = false;
        try { opened.exec('ROLLBACK'); } catch { failed = true; }
        try { opened.close(); } catch { failed = true; }
        if (failed) throw sourceCloseFailure();
      },
    };
  } catch {
    try { database?.close(); } catch { /* preserve fixed source error */ }
    throw invalidSource();
  }
}
