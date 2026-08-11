import path from 'node:path';
import { hashFile } from '../backup/manifest';
import { writeJsonArtifactExclusive } from '../reporting/reportWriter';
import type { ReadinessArtifact, ReadinessCheck, ReadinessReport } from '../reporting/reportTypes';
import type { MigrationReport } from '../types';
import type { CutoverOptions } from './types';

export function fixedCutoverFailure(error: unknown): { code: string; message: string } {
  const code = String((error as { code?: unknown } | null)?.code || 'CUTOVER_FAILED');
  const allowed = new Set([
    'CUTOVER_ALREADY_RUNNING', 'CUTOVER_TARGET_UNSAFE', 'CUTOVER_SESSION_CLOSE_FAILED',
    'CUTOVER_ADAPTER_INPUT_INVALID', 'CUTOVER_ADAPTER_UNAVAILABLE', 'CUTOVER_ADAPTER_FAILED',
    'CUTOVER_EVIDENCE_CHANGED', 'CUTOVER_EVIDENCE_PUBLICATION_FAILED', 'CUTOVER_RUN_EXISTS',
  ]);
  return {
    code: allowed.has(code) ? code : 'CUTOVER_FAILED',
    message: allowed.has(code) ? `Production cutover failed: ${code}` : 'Production cutover failed',
  };
}

export function buildCutoverReport(
  options: CutoverOptions,
  started: Date,
  finished: Date,
  checks: ReadinessCheck[],
  artifacts: ReadinessArtifact[],
  errors: ReadinessReport['errors'],
): ReadinessReport {
  return {
    runId: options.runId,
    schema: 'consensus',
    stage: 'cutover',
    status: errors.length ? 'failed' : 'passed',
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    durationMs: Math.max(0, finished.getTime() - started.getTime()),
    checks,
    artifacts,
    errors,
  };
}

export function cutoverPhaseArtifact(
  type: ReadinessArtifact['type'],
  candidate: string,
  sha256: string,
): ReadinessArtifact {
  return { type, path: path.basename(candidate), sha256 };
}

export async function persistCutoverMigration(
  options: CutoverOptions,
  artifacts: ReadinessArtifact[],
  migration: MigrationReport,
): Promise<string> {
  const candidate = path.join(path.resolve(options.outputDirectory), `${options.runId}-migration.json`);
  await writeJsonArtifactExclusive({ finalPath: candidate, payload: migration });
  artifacts.push(cutoverPhaseArtifact('migration-report', candidate, await hashFile(candidate)));
  return candidate;
}
