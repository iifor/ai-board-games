import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import {
  assertSameSourceSnapshot,
  captureSourceSnapshot,
  copySourceSnapshot,
  type SourceSnapshot,
} from '../backup/fileSnapshot';
import {
  cleanupOwnedTemporaryDirectory,
  recordOwnedTemporaryDirectory,
  type OwnedTemporaryDirectory,
} from '../backup/ownedTemporaryDirectory';
import { IMPORT_TABLES } from '../constants';
import { redactSecrets } from '../reporting/reportWriter';
import type { ReadinessCheck, ReadinessReport } from '../reporting/reportTypes';

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const POSTGRES_MAJOR_VERSION = 16;
const PREFLIGHT_POOL_MAX = 1;
const PREFLIGHT_CONNECTION_TIMEOUT_MS = 5_000;
const PREFLIGHT_STATEMENT_TIMEOUT_MS = 30_000;

interface DbExecutor {
  queryOne<T extends object>(sql: string, params?: readonly unknown[]): Promise<T | null>;
  close(): Promise<void>;
}

class ReadOnlyPostgresExecutor implements DbExecutor {
  constructor(private readonly pool: Pool) {}

  async queryOne<T extends object>(sql: string, params: readonly unknown[] = []): Promise<T | null> {
    const result = await this.pool.query<T>(sql, [...params]);
    return result.rows[0] || null;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export interface PreflightOptions {
  runId: string;
  sourcePath: string;
  targetUrl: string;
  targetSchema: string;
  outputDirectory: string;
  resourceDirectories: string[];
  requireTls: boolean;
}

export interface PreflightDependencies {
  createSqlite(inspectionCopyPath: string): Database.Database;
  createPostgres(url: string, schema: string): DbExecutor;
  availableBytes(path: string): Promise<number>;
  createTemporaryDirectory(): Promise<string>;
  renameTemporaryDirectory(source: string, destination: string): Promise<void>;
  removeTemporaryDirectory(path: string): Promise<void>;
}

function tlsVerificationEnabled(targetUrl: string): boolean {
  try {
    return new URL(targetUrl).searchParams.get('sslmode')?.toLowerCase() === 'verify-full';
  } catch {
    return false;
  }
}

const defaultDependencies: PreflightDependencies = {
  createSqlite: (inspectionCopyPath) => new Database(inspectionCopyPath, { readonly: true, fileMustExist: true }),
  createPostgres: (targetUrl, schema) => new ReadOnlyPostgresExecutor(new Pool({
    connectionString: targetUrl,
    max: PREFLIGHT_POOL_MAX,
    connectionTimeoutMillis: PREFLIGHT_CONNECTION_TIMEOUT_MS,
    statement_timeout: PREFLIGHT_STATEMENT_TIMEOUT_MS,
    ssl: tlsVerificationEnabled(targetUrl) ? { rejectUnauthorized: true } : false,
    application_name: 'consensus-preflight',
    options: `-c default_transaction_read_only=on -c search_path=${schema},public`,
  })),
  availableBytes: async (candidate) => {
    const stats = await fsPromises.statfs(candidate);
    return Number(stats.bavail) * Number(stats.bsize);
  },
  createTemporaryDirectory: () => fsPromises.mkdtemp(path.join(os.tmpdir(), 'consensus-preflight-')),
  renameTemporaryDirectory: (source, destination) => fsPromises.rename(source, destination),
  removeTemporaryDirectory: (candidate) => fsPromises.rm(candidate, { recursive: true, force: true }),
};

function quoteIdentifier(identifier: string): string {
  if (!IDENTIFIER.test(identifier)) throw new Error('Target schema must be a lowercase PostgreSQL identifier');
  return `"${identifier}"`;
}

function readOnlySize(candidate: string): number {
  try {
    const stats = fs.statSync(candidate);
    return stats.isFile() ? stats.size : 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
}

async function directorySize(directory: string): Promise<number> {
  let total = 0;
  const entries = await fsPromises.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directorySize(candidate);
    else if (entry.isFile()) total += (await fsPromises.stat(candidate)).size;
  }
  return total;
}

function report(runId: string, started: number, checks: ReadinessCheck[], errors: ReadinessReport['errors']): ReadinessReport {
  const finished = Date.now();
  return {
    runId,
    stage: 'preflight',
    status: errors.length ? 'failed' : 'passed',
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date(finished).toISOString(),
    durationMs: finished - started,
    checks,
    artifacts: [],
    errors,
  };
}

function failedCheck(
  checks: ReadinessCheck[],
  errors: ReadinessReport['errors'],
  id: string,
  code: string,
  message: string,
  expected?: string,
  actual?: string,
): false {
  const sanitizedMessage = redactSecrets(message);
  checks.push({ id, status: 'failed', expected, actual, message: sanitizedMessage });
  errors.push({ code, message: sanitizedMessage });
  return false;
}

function passedCheck(checks: ReadinessCheck[], id: string, message: string, expected?: string, actual?: string): true {
  checks.push({ id, status: 'passed', expected, actual, message: redactSecrets(message) });
  return true;
}

function validateOptions(options: PreflightOptions): string | null {
  if (!options.runId.trim()) return 'runId is required';
  if (!options.sourcePath.trim()) return 'sourcePath is required';
  if (!options.targetSchema.trim() || !IDENTIFIER.test(options.targetSchema)) return 'targetSchema must be a lowercase PostgreSQL identifier';
  if (!options.outputDirectory.trim()) return 'outputDirectory is required';
  if (!Array.isArray(options.resourceDirectories) || options.resourceDirectories.some((directory) => !directory.trim())) return 'resourceDirectories must contain non-empty paths';
  if (typeof options.requireTls !== 'boolean') return 'requireTls must be boolean';
  try {
    const parsed = new URL(options.targetUrl);
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') return 'targetUrl must use PostgreSQL';
  } catch {
    return 'targetUrl must be a PostgreSQL URL';
  }
  return null;
}

async function targetImportTablesAreEmpty(database: DbExecutor, schema: string): Promise<{ empty: boolean; missingTable?: string }> {
  const quotedSchema = quoteIdentifier(schema);
  for (const table of IMPORT_TABLES) {
    const relation = await database.queryOne<{ relation: string | null }>(
      'SELECT to_regclass(format(\'%I.%I\', $1::text, $2::text))::text AS relation',
      [schema, table],
    );
    if (!relation?.relation) return { empty: false, missingTable: table };
    const count = await database.queryOne<{ count: number }>(`SELECT COUNT(*)::int AS count FROM ${quotedSchema}."${table}"`);
    if (Number(count?.count || 0) > 0) return { empty: false };
  }
  return { empty: true };
}

export async function runPreflight(
  options: PreflightOptions,
  dependencies: Partial<PreflightDependencies> = {},
): Promise<ReadinessReport> {
  const started = Date.now();
  const checks: ReadinessCheck[] = [];
  const errors: ReadinessReport['errors'] = [];
  const resolved = { ...defaultDependencies, ...dependencies };
  let sqlite: Database.Database | undefined;
  let postgres: DbExecutor | undefined;
  let sourceSnapshot: SourceSnapshot | undefined;
  let temporaryDirectory: OwnedTemporaryDirectory | undefined;

  const runChecks = async (): Promise<void> => {
    const optionError = validateOptions(options);
    if (optionError) {
      failedCheck(checks, errors, 'parameters.safe', 'INVALID_PARAMETERS', optionError);
      return;
    }
    passedCheck(checks, 'parameters.safe', 'Preflight parameters are valid');

    if (!fs.existsSync(options.sourcePath)) {
      failedCheck(checks, errors, 'source.exists-and-readable', 'SOURCE_NOT_FOUND', 'SQLite source file does not exist');
      return;
    }
    try {
      const candidate = await resolved.createTemporaryDirectory();
      temporaryDirectory = await recordOwnedTemporaryDirectory(candidate);
    } catch {
      failedCheck(checks, errors, 'source.isolated-copy', 'PREFLIGHT_TEMP_SETUP_FAILED', 'Private SQLite inspection directory could not be created');
      return;
    }

    try {
      sourceSnapshot = await copySourceSnapshot(
        options.sourcePath,
        temporaryDirectory.path,
        'SOURCE_CHANGED_DURING_PREFLIGHT',
      );
      passedCheck(checks, 'source.isolated-copy', 'Live SQLite file set captured into a stable private copy without SQLite-opening the source');
    } catch {
      failedCheck(checks, errors, 'source.isolated-copy', 'SOURCE_CHANGED_DURING_PREFLIGHT', 'Live SQLite source changed during isolated preflight capture');
      return;
    }

    try {
      sqlite = resolved.createSqlite(path.join(temporaryDirectory.path, 'source.sqlite'));
      passedCheck(checks, 'source.exists-and-readable', 'Isolated SQLite copy opened read-only; live source was not SQLite-opened');
    } catch {
      failedCheck(checks, errors, 'source.exists-and-readable', 'SOURCE_INTEGRITY_FAILED', 'SQLite source cannot be opened read-only');
      return;
    }

    try {
      const integrity = sqlite.prepare('PRAGMA integrity_check').pluck().get();
      if (integrity !== 'ok') {
        failedCheck(checks, errors, 'source.integrity', 'SOURCE_INTEGRITY_FAILED', 'SQLite integrity check did not return ok', 'ok', String(integrity));
        return;
      }
      passedCheck(checks, 'source.integrity', 'SQLite integrity check passed', 'ok', 'ok');
    } catch {
      failedCheck(checks, errors, 'source.integrity', 'SOURCE_INTEGRITY_FAILED', 'SQLite integrity check could not complete');
      return;
    }

    let resourceBytes = 0;
    try {
      for (const directory of options.resourceDirectories) resourceBytes += await directorySize(directory);
      passedCheck(checks, 'resources.readable', 'Resource directories are readable');
    } catch {
      failedCheck(checks, errors, 'resources.readable', 'RESOURCE_DIRECTORY_UNREADABLE', 'A resource directory is missing or unreadable');
      return;
    }

    const sourceBytes = readOnlySize(options.sourcePath) + readOnlySize(`${options.sourcePath}-wal`) + readOnlySize(`${options.sourcePath}-shm`);
    const requiredBytes = 2 * (sourceBytes + resourceBytes);
    try {
      const available = await resolved.availableBytes(options.outputDirectory);
      if (!Number.isFinite(available) || available < requiredBytes) {
        failedCheck(checks, errors, 'disk.capacity', 'INSUFFICIENT_DISK_SPACE', 'Output volume does not have enough free space', `at least ${requiredBytes} bytes`, `${available} bytes`);
        return;
      }
      passedCheck(checks, 'disk.capacity', 'Output volume has sufficient free space', `at least ${requiredBytes} bytes`, `${available} bytes`);
    } catch {
      failedCheck(checks, errors, 'disk.capacity', 'OUTPUT_DIRECTORY_UNAVAILABLE', 'Output directory volume cannot be inspected');
      return;
    }

    try {
      postgres = resolved.createPostgres(options.targetUrl, options.targetSchema);
      const version = await postgres.queryOne<{ server_version_num: string }>('SHOW server_version_num');
      const versionNumber = Number(version?.server_version_num || 0);
      if (Math.floor(versionNumber / 10_000) !== POSTGRES_MAJOR_VERSION) {
        failedCheck(checks, errors, 'target.postgres-version', 'POSTGRES_VERSION_UNSUPPORTED', 'PostgreSQL major version must be 16', '16', String(Math.floor(versionNumber / 10_000) || 'unknown'));
        return;
      }
      passedCheck(checks, 'target.postgres-version', 'PostgreSQL major version is supported', '16', '16');
    } catch (error) {
      failedCheck(checks, errors, 'target.postgres-version', 'POSTGRES_CONNECTION_FAILED', error instanceof Error ? error.message : 'PostgreSQL connection failed');
      return;
    }

    const schema = await postgres.queryOne<{ exists: boolean }>('SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = $1) AS exists', [options.targetSchema]);
    if (!schema?.exists) {
      passedCheck(checks, 'target.schema-is-fresh', 'Target schema is absent and remains untouched');
    } else {
      passedCheck(checks, 'target.schema-is-fresh', 'Target schema already exists');
      try {
        const empty = await targetImportTablesAreEmpty(postgres, options.targetSchema);
        if (!empty.empty) {
          failedCheck(
            checks,
            errors,
            'target.import-tables-empty',
            empty.missingTable ? 'TARGET_TABLE_MISSING' : 'TARGET_NOT_EMPTY',
            empty.missingTable ? `Target import table is missing: ${empty.missingTable}` : 'Target import tables must be empty',
          );
          return;
        }
        passedCheck(checks, 'target.import-tables-empty', 'All target import tables are empty');
      } catch (error) {
        failedCheck(checks, errors, 'target.import-tables-empty', 'TARGET_NOT_EMPTY', error instanceof Error ? error.message : 'Target import table check failed');
        return;
      }
    }

    if (options.requireTls && !tlsVerificationEnabled(options.targetUrl)) {
      failedCheck(checks, errors, 'target.tls', 'TLS_REQUIRED', 'TLS certificate verification requires sslmode=verify-full');
      return;
    }
    passedCheck(checks, 'target.tls', options.requireTls ? 'TLS certificate verification is enabled' : 'TLS certificate verification is not required');
    passedCheck(checks, 'target.pool-and-timeouts', 'Preflight uses a single connection with bounded timeouts');
  };

  try {
    await runChecks();
  } catch (error) {
    failedCheck(checks, errors, 'preflight.unexpected', 'PREFLIGHT_FAILED', error instanceof Error ? error.message : 'Preflight failed');
  } finally {
    if (sqlite) {
      try {
        sqlite.close();
      } catch {
        failedCheck(checks, errors, 'source.close', 'SQLITE_CLOSE_FAILED', 'Private SQLite inspection connection could not be closed');
      }
    }
    if (postgres) {
      try {
        await postgres.close();
      } catch {
        failedCheck(checks, errors, 'target.close', 'POSTGRES_CLOSE_FAILED', 'PostgreSQL target connection could not be closed');
      }
    }
    if (sourceSnapshot) {
      try {
        const after = await captureSourceSnapshot(options.sourcePath, 'SOURCE_CHANGED_DURING_PREFLIGHT');
        assertSameSourceSnapshot(sourceSnapshot, after, 'SOURCE_CHANGED_DURING_PREFLIGHT');
        passedCheck(checks, 'source.unchanged', 'Live SQLite main, WAL, and SHM file set remained unchanged');
      } catch {
        failedCheck(checks, errors, 'source.unchanged', 'SOURCE_CHANGED_DURING_PREFLIGHT', 'Live SQLite source changed during preflight');
      }
    }
    if (temporaryDirectory) {
      try {
        await cleanupOwnedTemporaryDirectory(temporaryDirectory, {
          rename: resolved.renameTemporaryDirectory,
          remove: resolved.removeTemporaryDirectory,
        });
        passedCheck(checks, 'source.temp-cleanup', 'Private SQLite inspection directory removed');
      } catch {
        failedCheck(checks, errors, 'source.temp-cleanup', 'PREFLIGHT_TEMP_CLEANUP_FAILED', 'Private SQLite inspection directory cleanup failed');
      }
    }
  }
  return report(options.runId, started, checks, errors);
}
