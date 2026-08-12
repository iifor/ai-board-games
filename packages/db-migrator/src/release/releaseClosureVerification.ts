import path from 'node:path';
import {
  evaluateReleaseEvidence,
  REQUIRED_RELEASE_CHECKS,
  type ReleaseReadinessReport,
} from '../commands/release-readiness';
import { isReceiptArtifact, type ReceiptArtifact } from './deploymentReceiptCommon';
import { loadReleaseEvidence } from './evidence';
import { pathKey } from './stableJson';

export function hasReleaseEvidenceClosure(value: unknown): value is ReleaseReadinessReport['evidenceClosure'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const closure = value as { operatorSignoff?: unknown; reports?: unknown };
  return Object.keys(value).sort().join(',') === 'operatorSignoff,reports'
    && isReceiptArtifact(closure.operatorSignoff)
    && Array.isArray(closure.reports)
    && closure.reports.length > 0
    && closure.reports.every(isReceiptArtifact);
}

function matchesCapture(
  artifact: ReceiptArtifact,
  capture: { resolvedPath: string; sizeBytes: number; sha256: string },
  rootPath: string,
): boolean {
  const expectedPath = path.resolve(rootPath, ...artifact.path.split('/'));
  return pathKey(expectedPath) === pathKey(capture.resolvedPath)
    && artifact.sizeBytes === capture.sizeBytes
    && artifact.sha256 === capture.sha256;
}

export async function verifyReleaseEvidenceClosure(
  release: ReleaseReadinessReport,
  rootPath: string,
): Promise<void> {
  if (!hasReleaseEvidenceClosure(release.evidenceClosure)) throw new Error('release evidence closure is missing');
  const closure = release.evidenceClosure;
  const allPaths = [closure.operatorSignoff, ...closure.reports]
    .map((artifact) => pathKey(path.resolve(rootPath, ...artifact.path.split('/'))));
  if (new Set(allPaths).size !== allPaths.length) throw new Error('release evidence closure paths are duplicated');
  const signoffPath = path.resolve(rootPath, ...closure.operatorSignoff.path.split('/'));
  if (pathKey(path.dirname(signoffPath)) !== pathKey(rootPath)) {
    throw new Error('operator signoff must be rooted beside the traffic authorization');
  }
  const reportPaths = closure.reports.map((artifact) => path.resolve(rootPath, ...artifact.path.split('/')));
  const evidence = await loadReleaseEvidence(reportPaths, signoffPath);
  if (!matchesCapture(closure.operatorSignoff, evidence.signoffCapture, rootPath)
    || evidence.reportCaptures.length !== closure.reports.length
    || evidence.reportCaptures.some((capture, index) => !matchesCapture(closure.reports[index], capture, rootPath))) {
    throw new Error('release evidence closure bytes do not match');
  }
  const evaluated = evaluateReleaseEvidence(evidence.reports, evidence.signoff, {
    runId: release.runId,
    releaseCandidate: release.releaseCandidate,
  });
  const passed = evaluated.checks.filter((check) => check.status === 'passed').map((check) => check.id).sort();
  const expected = [...REQUIRED_RELEASE_CHECKS].sort();
  if (passed.length !== expected.length || passed.some((id, index) => id !== expected[index])
    || evaluated.minutes !== release.maintenanceWindowMinutes
    || evaluated.freezeReceiptSha256 !== release.freezeReceiptSha256) {
    throw new Error('release evidence closure does not reproduce the release result');
  }
}
