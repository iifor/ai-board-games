import path from 'node:path';
import { isSafeRunId } from '../backup/publication';
import { hashFile } from '../backup/manifest';
import { loadCutoverAuthorization } from '../cutover/authorization';
import {
  loadVerifiedCutoverSource,
  reserveCutoverEvidence,
  type CutoverEvidenceReservation,
} from '../cutover/evidence';
import {
  createCutoverMigrationClient,
  openCutoverTargetSession,
  readCutoverCa,
  validateCutoverEnvironment,
  type CutoverTargetSession,
} from '../cutover/targetSession';
import {
  buildCutoverReport,
  cutoverPhaseArtifact,
  fixedCutoverFailure,
  persistCutoverMigration,
} from '../cutover/reporting';
import type { CutoverOptions } from '../cutover/types';
import { migrateSqliteToPostgres } from '../importer';
import { runCutoverSchemaAdapter } from '../postgres/cutoverSchema';
import { writeReadinessReport } from '../reporting/reportWriter';
import type { ReadinessCheck, ReadinessReport } from '../reporting/reportTypes';
import { runApplicationSmoke } from '../smoke/applicationSmoke';
import type { MigrationOptions, MigrationReport } from '../types';
import { runValidation, type ValidateOptions } from './validate';

interface CutoverMigrationOptions extends MigrationOptions { tlsMode: string; caPath: string }

export interface CutoverDependencies {
  now(): Date;
  reserveEvidence: typeof reserveCutoverEvidence;
  openTargetSession: typeof openCutoverTargetSession;
  createSchema: typeof runCutoverSchemaAdapter;
  migrate(options: CutoverMigrationOptions): Promise<MigrationReport>;
  validate(options: ValidateOptions): Promise<ReadinessReport>;
  smoke: typeof runApplicationSmoke;
}

const GIT_SHA = /^[a-f0-9]{40}$/;

const defaultDependencies: CutoverDependencies = {
  now: () => new Date(),
  reserveEvidence: reserveCutoverEvidence,
  openTargetSession: openCutoverTargetSession,
  createSchema: runCutoverSchemaAdapter,
  migrate: (options) => migrateSqliteToPostgres(options, {
    createClient: () => createCutoverMigrationClient(options),
  }),
  validate: runValidation,
  smoke: runApplicationSmoke,
};

function invalidParameters(): Error & { code: 'CUTOVER_INVALID_PARAMETERS' } {
  return Object.assign(new Error('Production cutover parameters are invalid'), {
    code: 'CUTOVER_INVALID_PARAMETERS' as const,
  });
}

function validOptions(options: CutoverOptions): boolean {
  return isSafeRunId(options.runId)
    && Boolean(options.sourceSnapshotPath.trim() && options.sourceManifestPath.trim() && options.outputDirectory.trim())
    && (!options.execute || (
      GIT_SHA.test(options.releaseCandidate) && !/^0{40}$/.test(options.releaseCandidate)
      && Boolean(options.authorizationPath?.trim())
    ));
}

export async function runCutover(
  options: CutoverOptions,
  dependencies: Partial<CutoverDependencies> = {},
): Promise<ReadinessReport> {
  if (!validOptions(options)) throw invalidParameters();
  const resolved = { ...defaultDependencies, ...dependencies };
  const started = resolved.now();
  const initialSource = await loadVerifiedCutoverSource(options.sourceSnapshotPath, options.sourceManifestPath);
  const sourceCheck: ReadinessCheck = {
    id: 'source.snapshot.sha256', status: 'passed',
    expected: initialSource.sourceSnapshotSha256, actual: initialSource.sourceSnapshotSha256,
    message: 'Consistent SQLite snapshot matches the verified backup manifest',
  };
  const manifestCheck: ReadinessCheck = {
    id: 'source.manifest.sha256', status: 'passed',
    expected: initialSource.manifestSha256, actual: initialSource.manifestSha256,
    message: 'Verified backup manifest bytes are fixed for this cutover',
  };
  if (!options.execute) {
    return buildCutoverReport(options, started, resolved.now(), [
      sourceCheck, manifestCheck,
      { id: 'execution', status: 'skipped', message: 'Dry-run performed no database calls or filesystem writes' },
    ], [], []);
  }

  const authorization = await loadCutoverAuthorization({
    authorizationPath: options.authorizationPath!,
    runId: options.runId,
    releaseCandidate: options.releaseCandidate,
    manifestSha256: initialSource.manifestSha256,
    sourceSnapshotSha256: initialSource.sourceSnapshotSha256,
    now: started,
  });
  const finalSource = await loadVerifiedCutoverSource(options.sourceSnapshotPath, options.sourceManifestPath);
  if (finalSource.manifestSha256 !== initialSource.manifestSha256
    || finalSource.sourceSnapshotSha256 !== initialSource.sourceSnapshotSha256) {
    throw Object.assign(new Error('Verified cutover source changed'), { code: 'CUTOVER_SOURCE_INVALID' });
  }
  await validateCutoverEnvironment({
    targetUrl: options.targetUrl,
    tlsMode: options.tlsMode,
    caPath: options.caPath,
  });
  const reservation = await resolved.reserveEvidence({
    outputDirectory: options.outputDirectory,
    runId: options.runId,
    authorizationBytes: authorization.bytes,
    authorizationSha256: authorization.sha256,
    manifestBytes: finalSource.manifestBytes,
    manifestSha256: finalSource.manifestSha256,
    now: started,
  });
  return executeReservedCutover(options, resolved, reservation, started, [
    sourceCheck,
    manifestCheck,
    {
      id: 'authorization.valid', status: 'passed',
      expected: authorization.sha256, actual: authorization.sha256,
      message: 'Approved pre-cutover authorization is valid',
    },
    {
      id: 'authorization.sha256', status: 'passed',
      expected: authorization.sha256, actual: authorization.sha256,
      message: 'Authorization evidence hash is fixed',
    },
    {
      id: 'release.candidate', status: 'passed',
      expected: options.releaseCandidate, actual: options.releaseCandidate,
      message: 'Authorized release candidate matches the executing build',
    },
  ]);
}

async function executeReservedCutover(
  options: CutoverOptions,
  dependencies: CutoverDependencies,
  reservation: CutoverEvidenceReservation,
  started: Date,
  initialChecks: ReadinessCheck[],
): Promise<ReadinessReport> {
  const checks: ReadinessCheck[] = [...initialChecks];
  const artifacts = [...reservation.artifacts];
  const errors: ReadinessReport['errors'] = [];
  let session: CutoverTargetSession | undefined;
  let phase = 'target.safe';
  try {
    session = await dependencies.openTargetSession({
      targetUrl: options.targetUrl, tlsMode: options.tlsMode, caPath: options.caPath,
    });
    const safeTarget = 'database=consensus;schema=consensus;role=consensus_migrator;tls=verify-full';
    checks.push({
      id: 'target.safe', status: 'passed', expected: safeTarget, actual: safeTarget,
      message: 'Production target identity and empty database gate passed',
    });
    phase = 'schema.migrations';
    await dependencies.createSchema({ targetUrl: options.targetUrl, tlsMode: options.tlsMode, caPath: options.caPath });
    checks.push({ id: phase, status: 'passed', message: 'Canonical migrations created the consensus schema' });

    phase = 'import.transaction';
    let migration: MigrationReport;
    try {
      migration = await dependencies.migrate({
        sourcePath: options.sourceSnapshotPath, targetUrl: options.targetUrl, targetSchema: 'consensus',
        tlsMode: options.tlsMode, caPath: options.caPath,
      });
    } catch (error) {
      const failed = (error as Error & { migrationReport?: MigrationReport }).migrationReport;
      if (failed) await persistCutoverMigration(options, artifacts, failed);
      throw error;
    }
    const migrationPath = await persistCutoverMigration(options, artifacts, migration);
    checks.push({ id: phase, status: 'passed', message: 'SQLite import transaction committed' });

    phase = 'validation';
    const ca = await readCutoverCa(options.caPath);
    const validation = await dependencies.validate({
      runId: options.runId,
      sourceSnapshotPath: options.sourceSnapshotPath,
      sourceManifestPath: options.sourceManifestPath,
      migrationReportPath: migrationPath,
      targetUrl: options.targetUrl,
      targetSchema: 'consensus',
      outputDirectory: reservation.outputDirectory,
      targetTls: { ca, rejectUnauthorized: true },
    });
    const validationPath = path.join(reservation.outputDirectory, `${options.runId}-validation.json`);
    artifacts.push(cutoverPhaseArtifact('validation-report', validationPath, await hashFile(validationPath)));
    if (validation.status !== 'passed') {
      checks.push({ id: phase, status: 'failed', message: 'Formal post-import validation failed' });
      errors.push({ code: 'CUTOVER_VALIDATION_FAILED', message: 'Production cutover validation failed' });
    } else {
      checks.push({ id: phase, status: 'passed', message: 'Formal post-import validation passed' });
      phase = 'smoke';
      const smoke = await dependencies.smoke({
        runId: options.runId, targetUrl: options.targetUrl,
        targetSchema: 'consensus', outputDirectory: reservation.outputDirectory,
        productionCutover: true,
      });
      const smokePath = path.join(reservation.outputDirectory, `${options.runId}-smoke.json`);
      artifacts.push(cutoverPhaseArtifact('smoke-report', smokePath, await hashFile(smokePath)));
      if (smoke.status !== 'passed') {
        checks.push({ id: phase, status: 'failed', message: 'Compiled application smoke failed' });
        errors.push({ code: 'CUTOVER_SMOKE_FAILED', message: 'Production cutover smoke failed' });
      } else {
        checks.push({ id: phase, status: 'passed', message: 'Compiled application smoke passed' });
      }
    }
  } catch (error) {
    const failure = fixedCutoverFailure(error);
    errors.push(failure);
    if (!checks.some((check) => check.id === phase)) {
      checks.push({ id: phase, status: 'failed', message: failure.message });
    }
  }

  checks.push({
    id: 'closure.evidence',
    status: errors.length ? 'failed' : 'passed',
    message: errors.length ? 'Cutover failure evidence was preserved' : 'Cutover evidence closure is complete',
  });
  const finalReport = buildCutoverReport(options, started, dependencies.now(), checks, artifacts, errors);
  let primaryError: unknown;
  try {
    await writeReadinessReport({ outputDirectory: reservation.outputDirectory, report: finalReport });
  } catch (error) {
    primaryError = error;
  }
  try { await session?.release(); } catch (error) {
    if (!primaryError && finalReport.status === 'passed') primaryError = error;
  }
  if (primaryError) throw primaryError;
  return finalReport;
}

export type { CutoverOptions };
