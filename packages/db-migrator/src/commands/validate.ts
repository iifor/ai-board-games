import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { IMPORT_TABLES, SKIPPED_TABLES } from '../constants';
import { hashFile, verifyManifest, type BackupManifest } from '../backup/manifest';
import { isSafeRunId } from '../backup/publication';
import {
  redactSecrets,
  publishedFileIdentity,
  rollbackOwnedPublishedFile,
  writeReadinessReport,
  type PublishedFileIdentity,
} from '../reporting/reportWriter';
import type { ReadinessCheck, ReadinessReport } from '../reporting/reportTypes';
import type { MigrationReport } from '../types';
import { createValidationExecutor } from '../postgres/validationExecutor';
import {
  BUSINESS_SAMPLES,
  countImportedTables,
  findForeignKeyViolations,
  findJsonSemanticViolations,
  findTimestampViolations,
  readIdentityStates,
  type ValidationDbExecutor,
} from '../validation/queries';
import { businessSampleHash } from '../validation/sampleCanonicalization';

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

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
  createPostgres(targetUrl: string, targetSchema: string): ValidationDbExecutor;
  hashEvidence(candidate: string): Promise<string>;
  writeReport(options: Parameters<typeof writeReadinessReport>[0]): ReturnType<typeof writeReadinessReport>;
}

const defaultDependencies: ValidateDependencies = {
  createSqlite: (sourcePath) => new Database(sourcePath, { readonly: true, fileMustExist: true }),
  createPostgres: createValidationExecutor,
  hashEvidence: hashFile,
  writeReport: writeReadinessReport,
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
  if (!isSafeRunId(options.runId)) return 'runId must be a safe, non-empty identifier';
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

function postgresFailureMessage(base: string, error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return /\bpostgres(?:ql)?:\/\//i.test(raw) ? `${base}: [REDACTED_DATABASE_URL]` : base;
}

interface ValidationEvidence {
  version: 1;
  runId: string;
  stage: 'validation';
  status: ReadinessReport['status'];
  summary: { passed: number; failed: number; skipped: number };
  checks: Array<{ id: string; status: ReadinessCheck['status'] }>;
}

function buildValidationEvidence(report: ReadinessReport): ValidationEvidence {
  const summary = { passed: 0, failed: 0, skipped: 0 };
  const checks = report.checks.map((check) => {
    summary[check.status] += 1;
    return { id: redactSecrets(check.id), status: check.status };
  });
  return { version: 1, runId: report.runId, stage: 'validation', status: report.status, summary, checks };
}

interface PublishedValidationEvidence {
  artifact: { type: 'validation-report'; path: string; sha256: string };
  finalPath: string;
  ownership: PublishedFileIdentity;
  temporaryPath: string;
}

async function publishValidationEvidence(
  outputDirectory: string,
  report: ReadinessReport,
  hashEvidence: ValidateDependencies['hashEvidence'],
): Promise<PublishedValidationEvidence> {
  await fs.mkdir(outputDirectory, { recursive: true });
  const finalPath = path.join(outputDirectory, `${report.runId}-validation-evidence.json`);
  const temporaryPath = `${finalPath}.tmp-${randomUUID()}`;
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  let closed = false;
  let published = false;
  let ownership: PublishedFileIdentity | null = null;
  let retainTemporary = false;
  try {
    handle = await fs.open(temporaryPath, 'wx');
    await handle.writeFile(`${JSON.stringify(buildValidationEvidence(report), null, 2)}\n`, 'utf8');
    await handle.sync();
    ownership = publishedFileIdentity(await handle.stat({ bigint: true }));
    if (!ownership) throw new Error('Validation evidence identity is unavailable');
    await handle.close();
    closed = true;
    await fs.link(temporaryPath, finalPath);
    published = true;
    const sha256 = await hashEvidence(finalPath);
    retainTemporary = true;
    return {
      artifact: { type: 'validation-report', path: finalPath, sha256 },
      finalPath,
      ownership,
      temporaryPath,
    };
  } catch {
    let code = 'VALIDATION_EVIDENCE_PUBLICATION_FAILED';
    if (published && ownership) {
      const rollback = await rollbackOwnedPublishedFile({
        referencePath: temporaryPath,
        finalPath,
        expectedIdentity: ownership,
      });
      if (rollback !== 'removed-owned') code = 'VALIDATION_EVIDENCE_ROLLBACK_SKIPPED';
    }
    throw Object.assign(new Error('Validation evidence could not be published'), { code });
  } finally {
    if (handle && !closed) {
      try { await handle.close(); } catch { /* cleanup continues below */ }
    }
    if (!retainTemporary && ownership) {
      await rollbackOwnedPublishedFile({
        referencePath: temporaryPath,
        finalPath: temporaryPath,
        expectedIdentity: ownership,
      });
    }
  }
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

async function verifySourceManifest(options: ValidateOptions): Promise<void> {
  const raw: unknown = JSON.parse(await fs.readFile(options.sourceManifestPath, 'utf8'));
  const manifest = raw as BackupManifest;
  await verifyManifest(path.dirname(options.sourceManifestPath), manifest);
  const actualHash = await hashFile(options.sourceSnapshotPath);
  if (actualHash !== manifest.consistentDatabaseSha256) throw new Error('Source snapshot does not match the manifest hash');
}

async function validateRows(
  sqlite: Database.Database,
  postgres: ValidationDbExecutor,
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
  postgres: ValidationDbExecutor,
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
  postgres: ValidationDbExecutor,
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
  postgres: ValidationDbExecutor,
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
  postgres: ValidationDbExecutor,
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
  postgres: ValidationDbExecutor,
  checks: ReadinessCheck[],
  errors: ReadinessReport['errors'],
): Promise<void> {
  for (const sample of BUSINESS_SAMPLES) {
    const source = sqlite.prepare(sample.sourceSql).get() as Record<string, unknown> | undefined;
    const target = await postgres.queryOne<Record<string, unknown>>(sample.targetSql);
    const sourceHash = businessSampleHash(source || null, sample.bigintColumns, 'serialized');
    const targetHash = businessSampleHash(target, sample.bigintColumns);
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
  let postgres: ValidationDbExecutor | undefined;

  const runChecks = async (): Promise<void> => {
    const optionError = validateOptions(options);
    if (optionError) {
      failed(
        checks,
        errors,
        'parameters.safe',
        isSafeRunId(options.runId) ? 'INVALID_PARAMETERS' : 'INVALID_RUN_ID',
        optionError,
      );
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
      await postgres.queryOne<{ ready: number }>('SELECT 1 AS ready');
      passed(checks, 'target.open-readonly', 'PostgreSQL target opened for read-only validation');
    } catch (error) {
      failed(
        checks,
        errors,
        'target.open-readonly',
        'POSTGRES_CONNECTION_FAILED',
        postgresFailureMessage('PostgreSQL validation failed', error),
      );
      return;
    }

    try {
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
        postgresFailureMessage('Read-only validation query failed', error),
      );
    }
  };

  try {
    await runChecks();
  } catch (error) {
    failed(checks, errors, 'validation.unexpected', 'VALIDATION_FAILED', 'Validation failed');
  } finally {
    if (sqlite) {
      try {
        sqlite.close();
      } catch {
        failed(checks, errors, 'source.close', 'SQLITE_CLOSE_FAILED', 'SQLite source close failed');
      }
    }
    if (postgres) {
      try {
        await postgres.close();
      } catch (error) {
        failed(checks, errors, 'target.close', 'POSTGRES_CLOSE_FAILED', postgresFailureMessage('PostgreSQL target close failed', error));
      }
    }
  }

  for (const table of SKIPPED_TABLES) {
    checks.push({ id: `skipped.${table}`, status: 'skipped', message: 'intentionally not migrated' });
  }

  let result = createReport(options, started, checks, errors);
  if (!isSafeRunId(options.runId) || !options.outputDirectory.trim()) return result;
  let evidence: PublishedValidationEvidence | undefined;
  try {
    evidence = await publishValidationEvidence(options.outputDirectory, result, resolved.hashEvidence);
    result = { ...result, artifacts: [evidence.artifact] };
    await resolved.writeReport({ outputDirectory: options.outputDirectory, report: result });
  } catch (error) {
    let ownershipChanged = (error as NodeJS.ErrnoException).code === 'VALIDATION_EVIDENCE_ROLLBACK_SKIPPED';
    if (evidence) {
      const rollback = await rollbackOwnedPublishedFile({
        referencePath: evidence.temporaryPath,
        finalPath: evidence.finalPath,
        expectedIdentity: evidence.ownership,
      });
      ownershipChanged ||= rollback !== 'removed-owned';
      await rollbackOwnedPublishedFile({
        referencePath: evidence.temporaryPath,
        finalPath: evidence.temporaryPath,
        expectedIdentity: evidence.ownership,
      });
    }
    failed(checks, errors, 'validation-report.write', 'VALIDATION_REPORT_WRITE_FAILED', 'Validation report could not be written');
    if (ownershipChanged) {
      failed(
        checks,
        errors,
        'validation-evidence.rollback-ownership',
        'VALIDATION_EVIDENCE_ROLLBACK_SKIPPED',
        'Validation evidence rollback skipped because ownership changed or could not be proven',
      );
    }
    result = createReport(options, started, checks, errors);
    return result;
  }
  if (evidence) {
    await rollbackOwnedPublishedFile({
      referencePath: evidence.temporaryPath,
      finalPath: evidence.temporaryPath,
      expectedIdentity: evidence.ownership,
    });
  }
  return result;
}
