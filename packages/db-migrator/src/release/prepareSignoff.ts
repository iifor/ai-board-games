import { promises as fs } from 'node:fs';
import path from 'node:path';
import { captureStableFile } from '../backup/fileSnapshot';
import type { ReadinessReport } from '../reporting/reportTypes';
import { assertMatchingBackupVerification } from './backupVerification';
import { assertRequiredArtifacts, isReadinessReport, type ReportManifestEntry } from './evidence';
import { isInside, pathKey, readStableJson } from './stableJson';

export const OPERATOR_SIGNOFF_CHECKS = [
  'ci.release-gates', 'tests.no-critical-skips', 'backup.restore-drill', 'runtime.no-sqlite',
  'postgres.tls', 'postgres.least-privilege', 'postgres.pool-and-timeouts',
  'docs.runtime-truth', 'operator.signoff',
] as const;

export interface SignoffDraft {
  releaseCandidate: string;
  readinessRunId: string;
  goLiveOwner: { name: string; approvedAt: string };
  rollbackOwner: { name: string; approvedAt: string };
  maintenanceWindowMinutes: number;
  status: 'pending';
  version: 1;
  approved: false;
  approvedBy: string;
  approvedAt: string;
  checks: Array<{ id: string; status: 'failed' }>;
  reportManifest: ReportManifestEntry[];
}

export interface PrepareEvidenceOptions {
  runId: string;
  releaseCandidate: string;
  reportPaths: string[];
  outputDirectory: string;
  goLiveOwner: string;
  rollbackOwner: string;
}

function relativeManifestPath(root: string, candidate: string): string {
  const relative = path.relative(root, candidate).split(path.sep).join('/');
  if (!relative || relative === '..' || relative.startsWith('../')) throw new Error('Evidence path escapes the output directory');
  return relative;
}

export async function buildSignoffDraft(options: PrepareEvidenceOptions): Promise<SignoffDraft> {
  const root = path.resolve(options.outputDirectory);
  const rootStats = await fs.lstat(root);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) throw new Error('Signoff output must be a regular directory');
  const rootReal = await fs.realpath(root);
  if (pathKey(rootReal) !== pathKey(root)) throw new Error('Signoff output must not traverse a reparse point');
  const supplied = options.reportPaths.map((candidate) => path.resolve(candidate));
  if (new Set(supplied.map(pathKey)).size !== supplied.length) throw new Error('Supplied report paths are duplicated');

  const reports: ReadinessReport[] = [];
  const captures: Array<{ resolvedPath: string }> = [];
  const entries = new Map<string, ReportManifestEntry>();
  const addEntry = (candidate: string, sizeBytes: number, sha256: string): void => {
    const key = pathKey(candidate);
    const entry = { path: relativeManifestPath(root, candidate), sizeBytes, sha256 };
    const previous = entries.get(key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(entry)) throw new Error('Evidence identity is inconsistent');
    entries.set(key, entry);
  };
  for (const candidate of supplied) {
    const captured = await readStableJson<unknown>(candidate, root, rootReal);
    if (!isReadinessReport(captured.value)) throw new Error('Readiness report shape is invalid');
    if (captured.value.status !== 'passed' || captured.value.errors.length
      || captured.value.checks.some((check) => check.status === 'failed')) {
      throw new Error('Readiness report has not passed');
    }
    reports.push(captured.value);
    captures.push(captured);
    addEntry(captured.resolvedPath, captured.sizeBytes, captured.sha256);
  }

  const artifactClaims = new Set<string>();
  for (let index = 0; index < reports.length; index += 1) {
    const report = reports[index];
    assertRequiredArtifacts(report);
    for (const artifact of report.artifacts) {
      const candidate = path.resolve(path.dirname(captures[index].resolvedPath), artifact.path);
      if (!isInside(root, candidate)) throw new Error('Artifact path escapes the output directory');
      const key = pathKey(candidate);
      if (artifactClaims.has(key)) throw new Error('Artifact path is claimed more than once');
      artifactClaims.add(key);
      const captured = await captureStableFile(candidate, rootReal, path.basename(candidate), 'SIGNOFF_EVIDENCE_CHANGED');
      if (artifact.sha256 !== undefined && artifact.sha256 !== captured.sha256) {
        throw new Error('Artifact hash does not match its report');
      }
      addEntry(candidate, captured.sizeBytes, captured.sha256);
    }
  }
  assertMatchingBackupVerification(reports);
  const rehearsals = reports.filter((report) => report.stage === 'rehearsal');
  const maxDuration = rehearsals.length === 2 ? Math.max(...rehearsals.map((report) => report.durationMs)) : 0;
  return {
    releaseCandidate: options.releaseCandidate,
    readinessRunId: options.runId,
    goLiveOwner: { name: options.goLiveOwner, approvedAt: '1970-01-01T00:00:00.000Z' },
    rollbackOwner: { name: options.rollbackOwner, approvedAt: '1970-01-01T00:00:00.000Z' },
    maintenanceWindowMinutes: maxDuration ? Math.ceil((2 * maxDuration) / 60_000) : 0,
    status: 'pending',
    version: 1,
    approved: false,
    approvedBy: 'REPLACE_WITH_INDEPENDENT_OPERATOR',
    approvedAt: '1970-01-01T00:00:00.000Z',
    checks: OPERATOR_SIGNOFF_CHECKS.map((id) => ({ id, status: 'failed' })),
    reportManifest: [...entries.values()].sort((left, right) => left.path.localeCompare(right.path)),
  };
}
