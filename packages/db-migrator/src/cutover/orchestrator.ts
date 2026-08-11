import path from 'node:path';
import { hashFile } from '../backup/manifest';
import { assertCutoverAuthorizationCurrent } from './authorization';
import { prepareCutoverCompletion, publishCutoverCompletion } from './completion';
import { reserveCutoverEvidence, type CutoverEvidenceReservation } from './evidence';
import type { OpenVerifiedCutoverSource } from './sourceIdentity';
import {
  createCutoverMigrationClient,
  openCutoverTargetSession,
  readCutoverCa,
  type CutoverTargetSession,
} from './targetSession';
import {
  buildCutoverReport,
  cutoverPhaseArtifact,
  fixedCutoverFailure,
  persistCutoverMigration,
} from './reporting';
import type { CutoverAuthorization, CutoverOptions, LoadCutoverAuthorizationOptions } from './types';
import { migrateVerifiedSqliteToPostgres } from '../importer';
import { runCutoverSchemaAdapter } from '../postgres/cutoverSchema';
import { writeReadinessReport } from '../reporting/reportWriter';
import type { ReadinessCheck, ReadinessReport } from '../reporting/reportTypes';
import { runApplicationSmoke } from '../smoke/applicationSmoke';
import type { MigrationOptions, MigrationReport } from '../types';
import { runCutoverValidation, type CutoverValidationOptions } from './validation';

interface CutoverMigrationOptions extends MigrationOptions {
  tlsMode: string;
  caPath: string;
  sourceDatabase: OpenVerifiedCutoverSource['database'];
}

export interface CutoverDependencies {
  now(): Date;
  reserveEvidence: typeof reserveCutoverEvidence;
  openTargetSession: typeof openCutoverTargetSession;
  createSchema: typeof runCutoverSchemaAdapter;
  migrate(options: CutoverMigrationOptions): Promise<MigrationReport>;
  validate(options: CutoverValidationOptions): Promise<ReadinessReport>;
  smoke: typeof runApplicationSmoke;
  publishCompletion: typeof publishCutoverCompletion;
  writeReport: typeof writeReadinessReport;
}

export const defaultCutoverDependencies: CutoverDependencies = {
  now: () => new Date(),
  reserveEvidence: reserveCutoverEvidence,
  openTargetSession: openCutoverTargetSession,
  createSchema: runCutoverSchemaAdapter,
  migrate: (options) => migrateVerifiedSqliteToPostgres(options, options.sourceDatabase, {
    createClient: () => createCutoverMigrationClient(options),
  }),
  validate: runCutoverValidation,
  smoke: runApplicationSmoke,
  publishCompletion: publishCutoverCompletion,
  writeReport: writeReadinessReport,
};

export async function executeReservedCutover(
  options: CutoverOptions,
  dependencies: CutoverDependencies,
  reservation: CutoverEvidenceReservation,
  verifiedSource: OpenVerifiedCutoverSource,
  started: Date,
  authorization: CutoverAuthorization,
  authorizationContext: Omit<LoadCutoverAuthorizationOptions, 'authorizationPath' | 'now'>,
  initialChecks: ReadinessCheck[],
): Promise<ReadinessReport> {
  const checks: ReadinessCheck[] = [...initialChecks];
  const artifacts = [...reservation.artifacts];
  const sourceSnapshotSha256 = initialChecks.find((check) => check.id === 'source.snapshot.sha256')?.actual || '';
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
    assertCutoverAuthorizationCurrent(authorization, {
      authorizationPath: options.authorizationPath!, ...authorizationContext, now: dependencies.now(),
    });
    await dependencies.createSchema({ targetUrl: options.targetUrl, tlsMode: options.tlsMode, caPath: options.caPath });
    checks.push({ id: phase, status: 'passed', message: 'Canonical migrations created the consensus schema' });

    phase = 'import.transaction';
    await verifiedSource.assertUnchanged();
    let migration: MigrationReport;
    try {
      migration = await dependencies.migrate({
        sourcePath: options.sourceSnapshotPath, targetUrl: options.targetUrl, targetSchema: 'consensus',
        tlsMode: options.tlsMode, caPath: options.caPath, sourceDatabase: verifiedSource.database,
      });
    } catch (error) {
      const failed = (error as Error & { migrationReport?: MigrationReport }).migrationReport;
      if (failed) await persistCutoverMigration(options, artifacts, failed);
      throw error;
    }
    const migrationPath = await persistCutoverMigration(options, artifacts, migration);
    await verifiedSource.assertUnchanged();
    checks.push({ id: phase, status: 'passed', message: 'SQLite import transaction committed' });

    phase = 'validation';
    await verifiedSource.assertUnchanged();
    const ca = await readCutoverCa(options.caPath);
    const validation = await dependencies.validate({
      runId: options.runId,
      sourceSnapshotPath: options.sourceSnapshotPath,
      sourceManifestPath: options.sourceManifestPath,
      migrationReportPath: migrationPath,
      targetUrl: options.targetUrl,
      targetSchema: 'consensus',
      outputDirectory: reservation.outputDirectory,
      migration,
      ca,
    });
    await verifiedSource.assertUnchanged();
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
  const finished = dependencies.now();
  const completion = errors.length
    ? undefined
    : prepareCutoverCompletion(options, artifacts, sourceSnapshotSha256, finished);
  if (completion) artifacts.push(completion.artifact);
  const finalReport = buildCutoverReport(options, started, finished, checks, artifacts, errors);
  let primaryError: unknown;
  try {
    await dependencies.writeReport({ outputDirectory: reservation.outputDirectory, report: finalReport });
  } catch {
    primaryError = Object.assign(new Error('Production cutover report publication failed'), {
      code: 'CUTOVER_REPORT_PUBLICATION_FAILED',
    });
  }
  try { await session?.release(); } catch (error) {
    if (!primaryError && finalReport.status === 'passed') primaryError = error;
  }
  if (primaryError) throw primaryError;
  if (completion) {
    try {
      await dependencies.publishCompletion(completion);
    } catch {
      throw Object.assign(new Error('Production cutover completion publication failed'), {
        code: 'CUTOVER_COMPLETION_PUBLICATION_FAILED',
      });
    }
  }
  return finalReport;
}
