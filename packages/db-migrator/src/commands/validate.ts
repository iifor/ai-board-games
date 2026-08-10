import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { IMPORT_TABLES, SKIPPED_TABLES } from '../constants';
import { hashFile, verifyManifest, type BackupManifest } from '../backup/manifest';
import { redactSecrets, writeReadinessReport } from '../reporting/reportWriter';
import type { ReadinessCheck, ReadinessReport } from '../reporting/reportTypes';
import type { MigrationReport } from '../types';
import {
  BUSINESS_SAMPLES,
  countImportedTables,
  findForeignKeyViolations,
  findJsonSemanticViolations,
  findTimestampViolations,
  readIdentityStates,
  type DbExecutor,
} from '../validation/queries';

interface PostgresExecutorConfig {
  connectionString: string;
  schema: string;
  poolMax: number;
  connectionTimeoutMs: number;
  statementTimeoutMs: number;
  ssl: false | { rejectUnauthorized: true };
}

const { createPostgresExecutor } = require('../../../server/db/postgres') as {
  createPostgresExecutor(config: PostgresExecutorConfig): DbExecutor;
};

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const CONNECTION_TIMEOUT_MS = 5_000;
const STATEMENT_TIMEOUT_MS = 30_000;

export interface ValidateOptions {
  runId: string;
  sourceSnapshotPath: string;
  sourceManifestPath: string;
  migrationReportPath: string;
  targetUrl: string;
  targetSchema: string;
  outputDirectory: string;
}

export interface ValidateDependencies {
  createSqlite(sourcePath: string): Database.Database;
  createPostgres(targetUrl: string, targetSchema: string): DbExecutor;
}

function tlsConfiguration(targetUrl: string): false | { rejectUnauthorized: true } {
  try {
    return new URL(targetUrl).searchParams.get('sslmode')?.toLowerCase() === 'verify-full'
      ? { rejectUnauthorized: true }
      : false;
  } catch {
    return false;
  }
}

const defaultDependencies: ValidateDependencies = {
  createSqlite: (sourcePath) => new Database(sourcePath, { readonly: true, fileMustExist: true }),
  createPostgres: (targetUrl, targetSchema) => createPostgresExecutor({
    connectionString: targetUrl,
    schema: targetSchema,
    poolMax: 1,
    connectionTimeoutMs: CONNECTION_TIMEOUT_MS,
    statementTimeoutMs: STATEMENT_TIMEOUT_MS,
    ssl: tlsConfiguration(targetUrl),
  }),
};

function createReport(
  options: ValidateOptions,
  started: number,
  checks: ReadinessCheck[],
  errors: ReadinessReport['errors'],
): ReadinessReport {
  const finished = Date.now();
  return {
    runId: options.runId,
    stage: 'validation',
    status: errors.length ? 'failed' : 'passed',
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date(finished).toISOString(),
    durationMs: finished - started,
    checks,
    artifacts: [],
    errors,
  };
}

function passed(
  checks: ReadinessCheck[],
  id: string,
  message: string,
  expected?: string,
  actual?: string,
): void {
  checks.push({ id, status: 'passed', message: redactSecrets(message), expected, actual });
}

function failed(
  checks: ReadinessCheck[],
  errors: ReadinessReport['errors'],
  id: string,
  code: string,
  message: string,
  expected?: string,
  actual?: string,
): void {
  const sanitizedMessage = redactSecrets(message);
  checks.push({
    id,
    status: 'failed',
    message: sanitizedMessage,
    expected: expected === undefined ? undefined : redactSecrets(expected),
    actual: actual === undefined ? undefined : redactSecrets(actual),
  });
  errors.push({ code, message: sanitizedMessage });
}

function validateOptions(options: ValidateOptions): string | null {
  if (!options.runId.trim()) return 'runId is required';
  if (!options.sourceSnapshotPath.trim()) return 'sourceSnapshotPath is required';
  if (!options.sourceManifestPath.trim()) return 'sourceManifestPath is required';
  if (!options.migrationReportPath.trim()) return 'migrationReportPath is required';
  if (!options.outputDirectory.trim()) return 'outputDirectory is required';
  if (!IDENTIFIER.test(options.targetSchema)) return 'targetSchema must be a lowercase PostgreSQL identifier';
  try {
    const parsed = new URL(options.targetUrl);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) return 'targetUrl must use PostgreSQL';
  } catch {
    return 'targetUrl must be a PostgreSQL URL';
  }
  return null;
}

function isMigrationReport(value: unknown): value is MigrationReport {
  if (!value || typeof value !== 'object') return false;
  const report = value as Partial<MigrationReport>;
  if (report.status !== 'succeeded' || report.validation !== 'passed' || !report.tables || typeof report.tables !== 'object') return false;
  return IMPORT_TABLES.every((table) => {
    const counts = report.tables?.[table];
    return counts
      && Number.isSafeInteger(counts.sourceRows) && counts.sourceRows >= 0
      && Number.isSafeInteger(counts.importedRows) && counts.importedRows >= 0
      && Number.isSafeInteger(counts.targetRows) && counts.targetRows >= 0;
  });
}

async function readMigrationReport(candidate: string, options: ValidateOptions): Promise<MigrationReport> {
  const value: unknown = JSON.parse(await fs.readFile(candidate, 'utf8'));
  if (!isMigrationReport(value)) throw new Error('Migration report is not a successful importer report');
  if (value.targetSchema !== options.targetSchema || path.resolve(value.sourcePath) !== path.resolve(options.sourceSnapshotPath)) {
    throw new Error('Migration report does not belong to this source snapshot and target schema');
  }
  return value;
}

function sourceCount(sqlite: Database.Database, table: typeof IMPORT_TABLES[number]): number {
  const exists = sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
  if (!exists) return 0;
  const row = sqlite.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get() as { count: number };
  return Number(row.count);
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}

function normalizeSampleRow(row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) return null;
  return Object.fromEntries(Object.entries(row).map(([column, rawValue]) => {
    if (rawValue == null) return [column, null];
    if (column.endsWith('_json')) return [column, canonicalValue(JSON.parse(String(rawValue)))];
    if (column.endsWith('_at')) {
      const date = new Date(String(rawValue));
      return [column, Number.isNaN(date.getTime()) ? '[INVALID_TIMESTAMP]' : date.toISOString()];
    }
    return [column, rawValue];
  }));
}

function sampleHash(row: Record<string, unknown> | null): string {
  return createHash('sha256').update(JSON.stringify(canonicalValue(normalizeSampleRow(row)))).digest('hex');
}

async function verifySourceManifest(options: ValidateOptions): Promise<void> {
  const raw: unknown = JSON.parse(await fs.readFile(options.sourceManifestPath, 'utf8'));
  const manifest = raw as BackupManifest;
  await verifyManifest(path.dirname(options.sourceManifestPath), manifest);
  const actualHash = await hashFile(options.sourceSnapshotPath);
  if (actualHash !== manifest.consistentDatabaseSha256) throw new Error('Source snapshot does not match the manifest hash');
}

async function validateRows(
  sqlite: Database.Database,
  postgres: DbExecutor,
  migrationReport: MigrationReport,
  checks: ReadinessCheck[],
  errors: ReadinessReport['errors'],
): Promise<void> {
  const targetCounts = new Map((await countImportedTables(postgres)).map((entry) => [entry.table, Number(entry.count)]));
  for (const table of IMPORT_TABLES) {
    const source = sourceCount(sqlite, table);
    const imported = migrationReport.tables[table];
    const target = targetCounts.get(table);
    const expected = `source=${source}; importer.source=${imported.sourceRows}; importer.imported=${imported.importedRows}; importer.target=${imported.targetRows}`;
    const actual = `target=${target ?? 'missing'}`;
    if (target === source && imported.sourceRows === source && imported.importedRows === source && imported.targetRows === source) {
      passed(checks, `row-count.${table}`, 'Source, importer and target row counts match', expected, actual);
    } else {
      failed(checks, errors, `row-count.${table}`, 'ROW_COUNT_MISMATCH', `Row count mismatch for ${table}`, expected, actual);
    }
  }
}

async function validateForeignKeys(
  postgres: DbExecutor,
  checks: ReadinessCheck[],
  errors: ReadinessReport['errors'],
): Promise<void> {
  const violations = await findForeignKeyViolations(postgres);
  if (!violations.length) {
    passed(checks, 'foreign-keys.defined', 'All defined imported foreign keys resolve');
    return;
  }
  for (const violation of violations) {
    failed(
      checks,
      errors,
      `foreign-key.${violation.constraint}`,
      'ORPHAN_FOREIGN_KEY',
      `Foreign-key violation detected for ${violation.table}.${violation.key}`,
    );
  }
}

async function validateJson(
  postgres: DbExecutor,
  checks: ReadinessCheck[],
  errors: ReadinessReport['errors'],
): Promise<void> {
  const violations = await findJsonSemanticViolations(postgres);
  if (!violations.length) {
    passed(checks, 'json.imported-fields', 'Imported JSON fields have the required object or array semantics');
    return;
  }
  for (const violation of violations) {
    failed(
      checks,
      errors,
      `json.${violation.table}.${violation.column}`,
      'JSON_SEMANTICS_INVALID',
      `JSON semantic mismatch for ${violation.table}.${violation.column}`,
      violation.expectedType,
      `${violation.count} invalid rows`,
    );
  }
}

async function validateTimestamps(
  postgres: DbExecutor,
  checks: ReadinessCheck[],
  errors: ReadinessReport['errors'],
): Promise<void> {
  const violations = await findTimestampViolations(postgres);
  if (!violations.length) {
    passed(checks, 'timestamps.imported-fields', 'Imported timestamps are finite');
    return;
  }
  for (const violation of violations) {
    failed(
      checks,
      errors,
      `timestamp.${violation.table}.${violation.column}`,
      'TIMESTAMP_SEMANTICS_INVALID',
      `Timestamp semantic mismatch for ${violation.table}.${violation.column}`,
      'finite timestamp',
      `${violation.count} invalid rows`,
    );
  }
}

async function validateIdentities(
  postgres: DbExecutor,
  checks: ReadinessCheck[],
  errors: ReadinessReport['errors'],
): Promise<void> {
  for (const state of await readIdentityStates(postgres)) {
    const nextValue = state.isCalled ? Number(state.lastValue) + 1 : Number(state.lastValue);
    if (state.maxId == null || nextValue > Number(state.maxId)) {
      passed(checks, `identity.${state.table}`, 'Identity sequence next value is safe', `greater than ${state.maxId ?? 'no rows'}`, String(nextValue));
    } else {
      failed(
        checks,
        errors,
        `identity.${state.table}`,
        'IDENTITY_SEQUENCE_INVALID',
        `Identity sequence next value is not safe for ${state.table}`,
        `greater than ${state.maxId}`,
        String(nextValue),
      );
    }
  }
}

async function validateBusinessSamples(
  sqlite: Database.Database,
  postgres: DbExecutor,
  checks: ReadinessCheck[],
  errors: ReadinessReport['errors'],
): Promise<void> {
  for (const sample of BUSINESS_SAMPLES) {
    const source = sqlite.prepare(sample.sourceSql).get() as Record<string, unknown> | undefined;
    const target = await postgres.queryOne<Record<string, unknown>>(sample.targetSql);
    const sourceHash = sampleHash(source || null);
    const targetHash = sampleHash(target);
    if (sourceHash === targetHash) {
      passed(checks, `sample.${sample.id}`, `Deterministic ${sample.table} sample matches`, `sha256:${sourceHash}`, `sha256:${targetHash}`);
    } else {
      failed(
        checks,
        errors,
        `sample.${sample.id}`,
        'BUSINESS_SAMPLE_MISMATCH',
        `Deterministic ${sample.table} sample does not match`,
        `sha256:${sourceHash}`,
        `sha256:${targetHash}`,
      );
    }
  }
}

export async function runValidation(
  options: ValidateOptions,
  dependencies: Partial<ValidateDependencies> = {},
): Promise<ReadinessReport> {
  const started = Date.now();
  const checks: ReadinessCheck[] = [];
  const errors: ReadinessReport['errors'] = [];
  const resolved = { ...defaultDependencies, ...dependencies };
  let sqlite: Database.Database | undefined;
  let postgres: DbExecutor | undefined;

  const runChecks = async (): Promise<void> => {
    const optionError = validateOptions(options);
    if (optionError) {
      failed(checks, errors, 'parameters.safe', 'INVALID_PARAMETERS', optionError);
      return;
    }
    passed(checks, 'parameters.safe', 'Validation parameters are valid');

    try {
      await verifySourceManifest(options);
      passed(checks, 'source.manifest-hash', 'Source snapshot matches its verified Task 4 manifest');
    } catch {
      failed(checks, errors, 'source.manifest-hash', 'SOURCE_HASH_MISMATCH', 'Source snapshot does not match its verified manifest');
      return;
    }

    let migrationReport: MigrationReport;
    try {
      migrationReport = await readMigrationReport(options.migrationReportPath, options);
      passed(checks, 'migration-report.valid', 'Migration report is a successful importer report');
    } catch {
      failed(checks, errors, 'migration-report.valid', 'MIGRATION_REPORT_INVALID', 'Migration report is missing, malformed or unsuccessful');
      return;
    }

    try {
      sqlite = resolved.createSqlite(options.sourceSnapshotPath);
      passed(checks, 'source.open-readonly', 'Source snapshot opened read-only with fileMustExist');
    } catch {
      failed(checks, errors, 'source.open-readonly', 'SOURCE_OPEN_FAILED', 'Source snapshot cannot be opened read-only');
      return;
    }

    try {
      postgres = resolved.createPostgres(options.targetUrl, options.targetSchema);
      await validateRows(sqlite, postgres, migrationReport, checks, errors);
      await validateForeignKeys(postgres, checks, errors);
      await validateJson(postgres, checks, errors);
      await validateTimestamps(postgres, checks, errors);
      await validateIdentities(postgres, checks, errors);
      await validateBusinessSamples(sqlite, postgres, checks, errors);
    } catch (error) {
      failed(
        checks,
        errors,
        'validation.queries',
        'VALIDATION_QUERY_FAILED',
        error instanceof Error ? error.message : 'Validation query failed',
      );
    }
  };

  try {
    await runChecks();
  } catch (error) {
    failed(checks, errors, 'validation.unexpected', 'VALIDATION_FAILED', error instanceof Error ? error.message : 'Validation failed');
  } finally {
    if (sqlite) {
      try {
        sqlite.close();
      } catch (error) {
        failed(checks, errors, 'source.close', 'SQLITE_CLOSE_FAILED', error instanceof Error ? error.message : 'SQLite source close failed');
      }
    }
    if (postgres) {
      try {
        await postgres.close();
      } catch (error) {
        failed(checks, errors, 'target.close', 'POSTGRES_CLOSE_FAILED', error instanceof Error ? error.message : 'PostgreSQL target close failed');
      }
    }
  }

  for (const table of SKIPPED_TABLES) {
    checks.push({ id: `skipped.${table}`, status: 'skipped', message: 'intentionally not migrated' });
  }

  let result = createReport(options, started, checks, errors);
  try {
    const written = await writeReadinessReport({ outputDirectory: options.outputDirectory, report: result });
    if (result.status === 'passed') {
      result = {
        ...result,
        artifacts: [{ type: 'validation-report', path: written.jsonPath, sha256: await hashFile(written.jsonPath) }],
      };
    }
  } catch (error) {
    failed(checks, errors, 'validation-report.write', 'VALIDATION_REPORT_WRITE_FAILED', error instanceof Error ? error.message : 'Validation report could not be written');
    result = createReport(options, started, checks, errors);
  }
  return result;
}
