import { promises as fs } from 'node:fs';
import path from 'node:path';
import { hashFile, verifyManifest, type BackupManifest } from '../backup/manifest';
import { isSafeRunId } from '../backup/publication';
import { migrateSqliteToPostgres } from '../importer';
import {
  assertRehearsalDatabase,
  buildRehearsalSchema,
  createRehearsalSchema,
  rehearsalRunExists,
  rehearsalSchemaExists,
} from '../postgres/rehearsalSchema';
import { writeJsonArtifactExclusive, writeReadinessReport } from '../reporting/reportWriter';
import type { ReadinessArtifact, ReadinessCheck, ReadinessReport } from '../reporting/reportTypes';
import type { MigrationReport } from '../types';
import { runApplicationSmoke } from '../smoke/applicationSmoke';
import { runValidation } from './validate';

export interface RehearsalOptions {
  runId: string;
  sourceSnapshotPath: string;
  sourceManifestPath: string;
  targetUrl: string;
  outputDirectory: string;
  execute: boolean;
}

export interface RehearsalResult {
  schema: string;
  report: ReadinessReport;
  migrationReportPath?: string;
  validationReportPath?: string;
  smokeReportPath?: string;
}

export interface RehearsalDependencies {
  now(): Date;
  schemaExists(targetUrl: string, schema: string): Promise<boolean>;
  runExists(targetUrl: string, schema: string): Promise<boolean>;
  createSchema(targetUrl: string, schema: string): Promise<void>;
  migrate: typeof migrateSqliteToPostgres;
  validate: typeof runValidation;
  smoke: typeof runApplicationSmoke;
}

const defaultDependencies: RehearsalDependencies = {
  now: () => new Date(),
  schemaExists: rehearsalSchemaExists,
  runExists: rehearsalRunExists,
  createSchema: createRehearsalSchema,
  migrate: migrateSqliteToPostgres,
  validate: runValidation,
  smoke: runApplicationSmoke,
};

function createReport(
  options: RehearsalOptions,
  schema: string,
  started: number,
  checks: ReadinessCheck[],
  artifacts: ReadinessArtifact[],
  errors: ReadinessReport['errors'],
): ReadinessReport {
  const finished = Date.now();
  return {
    runId: options.runId,
    schema,
    stage: 'rehearsal',
    status: errors.length ? 'failed' : 'passed',
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date(finished).toISOString(),
    durationMs: finished - started,
    checks,
    artifacts,
    errors,
  };
}

function knownError(error: unknown): { code: string; message: string } {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'REHEARSAL_TARGET_EXISTS') {
    return { code, message: 'Rehearsal target schema already exists' };
  }
  if (code === 'REHEARSAL_DATABASE_UNSAFE') {
    return { code, message: 'Migration rehearsal requires a dedicated test database' };
  }
  if (code === 'INVALID_RUN_ID') return { code, message: 'runId must be a safe, non-empty identifier' };
  return { code: 'REHEARSAL_FAILED', message: 'Migration rehearsal failed' };
}

async function readAndVerifySource(options: RehearsalOptions): Promise<string> {
  const raw = JSON.parse(await fs.readFile(options.sourceManifestPath, 'utf8')) as BackupManifest;
  await verifyManifest(path.dirname(options.sourceManifestPath), raw);
  const sourceHash = await hashFile(options.sourceSnapshotPath);
  if (sourceHash !== raw.consistentDatabaseSha256) {
    throw Object.assign(new Error('Source snapshot does not match manifest'), { code: 'SOURCE_HASH_MISMATCH' });
  }
  return sourceHash;
}

async function writeMigrationReport(
  outputDirectory: string,
  runId: string,
  report: MigrationReport,
): Promise<string> {
  const reportPath = path.join(outputDirectory, `${runId}-migration.json`);
  await writeJsonArtifactExclusive({ finalPath: reportPath, payload: report });
  return reportPath;
}

async function persistSummary(options: RehearsalOptions, report: ReadinessReport): Promise<void> {
  await writeReadinessReport({ outputDirectory: options.outputDirectory, report });
}

async function rehearsalRunAlreadyPublished(options: RehearsalOptions): Promise<boolean> {
  const candidates = [
    path.join(options.outputDirectory, `${options.runId}-rehearsal.json`),
    path.join(options.outputDirectory, `${options.runId}-rehearsal.md`),
    path.join(options.outputDirectory, `${options.runId}-migration.json`),
    path.join(options.outputDirectory, `${options.runId}-validation.json`),
    path.join(options.outputDirectory, `${options.runId}-smoke.json`),
    path.join(options.outputDirectory, `${options.runId}-smoke.md`),
  ];
  const states = await Promise.all(candidates.map(async (candidate) => {
    try {
      await fs.access(candidate);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }));
  return states.some(Boolean);
}

export async function runRehearsal(
  options: RehearsalOptions,
  dependencies: Partial<RehearsalDependencies> = {},
): Promise<RehearsalResult> {
  const started = Date.now();
  const checks: ReadinessCheck[] = [];
  const artifacts: ReadinessArtifact[] = [];
  const errors: ReadinessReport['errors'] = [];
  const resolved = { ...defaultDependencies, ...dependencies };
  if (!isSafeRunId(options.runId)) {
    throw Object.assign(new Error('runId must be a safe, non-empty identifier'), { code: 'INVALID_RUN_ID' });
  }
  const schema = buildRehearsalSchema(options.runId, resolved.now());
  let migrationReportPath: string | undefined;
  let validationReportPath: string | undefined;
  let smokeReportPath: string | undefined;

  try {
    const sourceHash = await readAndVerifySource(options);
    checks.push({
      id: 'source.snapshot.sha256', status: 'passed', message: 'Source snapshot matches the verified manifest',
      expected: sourceHash, actual: sourceHash,
    });
    if (await rehearsalRunAlreadyPublished(options)) {
      const failure = { code: 'REHEARSAL_TARGET_EXISTS', message: 'Rehearsal runId already has preserved reports' };
      errors.push(failure);
      checks.push({ id: 'run.unique', status: 'failed', message: failure.message });
      return { schema, report: createReport(options, schema, started, checks, artifacts, errors) };
    }
    assertRehearsalDatabase(options.targetUrl);
    checks.push({ id: 'database.safety', status: 'passed', message: 'Target database is dedicated to testing' });
    if (!options.execute) {
      checks.push({ id: 'schema.proposed', status: 'passed', message: `Dry-run would use safe schema: ${schema}` });
      checks.push({ id: 'execution', status: 'skipped', message: 'Dry-run: schema creation and migration were not executed' });
      const report = createReport(options, schema, started, checks, artifacts, errors);
      await persistSummary(options, report);
      return { schema, report };
    }

    if (await resolved.runExists(options.targetUrl, schema)) {
      throw Object.assign(new Error('Rehearsal runId already exists'), { code: 'REHEARSAL_TARGET_EXISTS' });
    }
    if (await resolved.schemaExists(options.targetUrl, schema)) {
      throw Object.assign(new Error('Rehearsal target schema already exists'), { code: 'REHEARSAL_TARGET_EXISTS' });
    }
    checks.push({ id: 'schema.unique', status: 'passed', message: `Rehearsal schema is available: ${schema}` });

    await resolved.createSchema(options.targetUrl, schema);
    checks.push({ id: 'schema.migrations', status: 'passed', message: 'Canonical PostgreSQL migrations were applied' });
    let migrationReport: MigrationReport;
    try {
      migrationReport = await resolved.migrate({
        sourcePath: options.sourceSnapshotPath,
        targetUrl: options.targetUrl,
        targetSchema: schema,
      });
    } catch (error) {
      const failedReport = (error as Error & { migrationReport?: MigrationReport }).migrationReport;
      if (failedReport) {
        migrationReportPath = await writeMigrationReport(options.outputDirectory, options.runId, failedReport);
        artifacts.push({ type: 'migration-report', path: migrationReportPath });
      }
      throw Object.assign(new Error('SQLite import failed'), { code: 'REHEARSAL_IMPORT_FAILED' });
    }
    migrationReportPath = await writeMigrationReport(options.outputDirectory, options.runId, migrationReport);
    artifacts.push({ type: 'migration-report', path: migrationReportPath });
    checks.push({ id: 'import.transaction', status: 'passed', message: 'SQLite import transaction passed' });

    const validation = await resolved.validate({
      runId: options.runId,
      sourceSnapshotPath: options.sourceSnapshotPath,
      sourceManifestPath: options.sourceManifestPath,
      migrationReportPath,
      targetUrl: options.targetUrl,
      targetSchema: schema,
      outputDirectory: options.outputDirectory,
    });
    validationReportPath = path.join(options.outputDirectory, `${options.runId}-validation.json`);
    artifacts.push({ type: 'validation-report', path: validationReportPath });
    if (validation.status !== 'passed') {
      errors.push({ code: 'REHEARSAL_VALIDATION_FAILED', message: 'Post-import validation failed' });
      checks.push({ id: 'validation', status: 'failed', message: 'Formal post-import validation failed' });
    } else {
      checks.push({ id: 'validation', status: 'passed', message: 'Formal post-import validation passed' });
      const smoke = await resolved.smoke({
        runId: options.runId,
        targetUrl: options.targetUrl,
        targetSchema: schema,
        outputDirectory: options.outputDirectory,
      });
      smokeReportPath = path.join(options.outputDirectory, `${options.runId}-smoke.json`);
      artifacts.push({ type: 'smoke-report', path: smokeReportPath });
      if (smoke.status !== 'passed') {
        errors.push({ code: 'REHEARSAL_SMOKE_FAILED', message: 'Compiled application smoke failed' });
        checks.push({ id: 'smoke', status: 'failed', message: 'Compiled application smoke failed' });
      } else {
        checks.push({ id: 'smoke', status: 'passed', message: 'Compiled application smoke passed' });
      }
    }
  } catch (error) {
    const failure = (error as { code?: unknown } | null)?.code === 'REHEARSAL_IMPORT_FAILED'
      ? { code: 'REHEARSAL_IMPORT_FAILED', message: 'SQLite import failed' }
      : (error as { code?: unknown } | null)?.code === 'SOURCE_HASH_MISMATCH'
        ? { code: 'SOURCE_HASH_MISMATCH', message: 'Source snapshot does not match the verified manifest' }
        : knownError(error);
    errors.push(failure);
    checks.push({ id: 'rehearsal', status: 'failed', message: failure.message });
  }

  const report = createReport(options, schema, started, checks, artifacts, errors);
  await persistSummary(options, report);
  return { schema, report, migrationReportPath, validationReportPath, smokeReportPath };
}
