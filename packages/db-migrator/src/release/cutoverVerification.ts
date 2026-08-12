import path from 'node:path';
import type { BackupManifest } from '../backup/manifest';
import { assertCutoverAuthorizationCurrent } from '../cutover/authorization';
import type { CutoverAuthorization } from '../cutover/types';
import { CUTOVER_TARGET } from '../cutover/types';
import type { ArtifactType, ReadinessReport } from '../reporting/reportTypes';
import type { MigrationReport } from '../types';
import { pathKey, type StableJson } from './stableJson';

export interface CapturedReleaseArtifact {
  type: ArtifactType;
  resolvedPath: string;
  sha256: string;
  value: unknown;
}

interface OwnerReceipt {
  version: 1;
  purpose: 'production-cutover-owner';
  runId: string;
  schema: 'consensus';
  reservedAt: string;
  nonce: string;
}

interface CompletionReceipt {
  version: 1;
  purpose: 'production-cutover-completion';
  runId: string;
  schema: 'consensus';
  releaseCandidate: string;
  sourceSnapshotSha256: string;
  freezeReceiptSha256: string;
  manifestSha256: string;
  authorizationSha256: string;
  ownerReceiptSha256: string;
  migrationReportSha256: string;
  validationReportSha256: string;
  smokeReportSha256: string;
  target: typeof CUTOVER_TARGET;
  completedAt: string;
}

const SHA256 = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const OWNER_KEYS = ['version', 'purpose', 'runId', 'schema', 'reservedAt', 'nonce'];
const COMPLETION_KEYS = [
  'version', 'purpose', 'runId', 'schema', 'releaseCandidate', 'sourceSnapshotSha256',
  'freezeReceiptSha256',
  'manifestSha256', 'authorizationSha256', 'ownerReceiptSha256', 'migrationReportSha256',
  'validationReportSha256', 'smokeReportSha256', 'target', 'completedAt',
];

function exactKeys(value: unknown, expected: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function canonicalTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function exactCheck(report: ReadinessReport, id: string, pattern: RegExp): string {
  const matching = report.checks.filter((check) => check.id === id);
  const value = matching[0]?.actual;
  if (matching.length !== 1 || matching[0].status !== 'passed'
    || value !== matching[0].expected || !value || !pattern.test(value)) {
    throw new Error('Cutover report cryptographic checks are incomplete');
  }
  return value;
}

function artifactByType(
  report: ReadinessReport,
  reportPath: string,
  captures: Map<string, CapturedReleaseArtifact>,
  type: ArtifactType,
): CapturedReleaseArtifact {
  const matching = report.artifacts.filter((artifact) => artifact.type === type);
  if (matching.length !== 1 || !matching[0].sha256) throw new Error('Cutover artifact closure is incomplete');
  const capture = captures.get(pathKey(path.resolve(path.dirname(reportPath), matching[0].path)));
  if (!capture || capture.type !== type || capture.sha256 !== matching[0].sha256) {
    throw new Error('Cutover artifact capture does not match its report claim');
  }
  return capture;
}

function assertOwner(value: unknown, runId: string): asserts value is OwnerReceipt {
  if (!exactKeys(value, OWNER_KEYS) || value.version !== 1 || value.purpose !== 'production-cutover-owner'
    || value.runId !== runId || value.schema !== 'consensus' || !canonicalTime(value.reservedAt)
    || typeof value.nonce !== 'string' || !value.nonce) throw new Error('Cutover owner receipt is invalid');
}

function assertCompletion(value: unknown, runId: string): asserts value is CompletionReceipt {
  if (!exactKeys(value, COMPLETION_KEYS) || value.version !== 1 || value.purpose !== 'production-cutover-completion'
    || value.runId !== runId || value.schema !== 'consensus' || !canonicalTime(value.completedAt)
    || !GIT_SHA.test(String(value.releaseCandidate))
    || !['sourceSnapshotSha256', 'freezeReceiptSha256', 'manifestSha256', 'authorizationSha256', 'ownerReceiptSha256',
      'migrationReportSha256', 'validationReportSha256', 'smokeReportSha256']
      .every((key) => SHA256.test(String(value[key])))
    || JSON.stringify(value.target) !== JSON.stringify(CUTOVER_TARGET)) {
    throw new Error('Cutover completion receipt is invalid');
  }
}

function exactPhaseCapture(
  reports: ReadinessReport[],
  reportCaptures: StableJson<ReadinessReport>[],
  artifact: CapturedReleaseArtifact,
  stage: 'validation' | 'smoke',
  cutover: ReadinessReport,
): void {
  const matches = reportCaptures.filter((capture, index) => (
    pathKey(capture.resolvedPath) === pathKey(artifact.resolvedPath)
    && capture.sha256 === artifact.sha256
    && reports[index].stage === stage
    && reports[index].runId === cutover.runId
    && reports[index].schema === cutover.schema
    && reports[index].status === 'passed'
  ));
  if (matches.length !== 1) throw new Error('Cutover phase report is not the exact supplied same-run capture');
}

export function assertCutoverEvidenceClosure(
  reports: ReadinessReport[],
  reportCaptures: StableJson<ReadinessReport>[],
  artifactCaptures: Map<string, CapturedReleaseArtifact>,
): void {
  const cutovers = reports.filter((report) => report.stage === 'cutover');
  if (!cutovers.length) return;
  for (const cutover of cutovers) {
    const reportPath = reportCaptures[reports.indexOf(cutover)]?.resolvedPath;
    if (!reportPath) throw new Error('Cutover report capture is missing');
    const authorization = artifactByType(cutover, reportPath, artifactCaptures, 'authorization');
    const manifest = artifactByType(cutover, reportPath, artifactCaptures, 'manifest');
    const owner = artifactByType(cutover, reportPath, artifactCaptures, 'owner-receipt');
    const migration = artifactByType(cutover, reportPath, artifactCaptures, 'migration-report');
    const validation = artifactByType(cutover, reportPath, artifactCaptures, 'validation-report');
    const smoke = artifactByType(cutover, reportPath, artifactCaptures, 'smoke-report');
    const completion = artifactByType(cutover, reportPath, artifactCaptures, 'completion-receipt');
    const sourceHash = exactCheck(cutover, 'source.snapshot.sha256', SHA256);
    const manifestHash = exactCheck(cutover, 'source.manifest.sha256', SHA256);
    const authorizationValidHash = exactCheck(cutover, 'authorization.valid', SHA256);
    const authorizationHash = exactCheck(cutover, 'authorization.sha256', SHA256);
    const candidate = exactCheck(cutover, 'release.candidate', GIT_SHA);
    const freezeReceiptSha256 = exactCheck(cutover, 'freeze.receipt.sha256', SHA256);

    if (manifest.sha256 !== manifestHash || authorization.sha256 !== authorizationHash
      || authorizationValidHash !== authorizationHash) {
      throw new Error('Cutover checks do not bind their captured artifacts');
    }
    const manifestValue = manifest.value as BackupManifest;
    if (manifestValue?.version !== 1 || manifestValue.consistentDatabaseSha256 !== sourceHash) {
      throw new Error('Cutover manifest does not bind the source snapshot');
    }
    assertCutoverAuthorizationCurrent(authorization.value as CutoverAuthorization, {
      authorizationPath: authorization.resolvedPath,
      runId: cutover.runId,
      releaseCandidate: candidate,
      manifestSha256: manifest.sha256,
      sourceSnapshotSha256: sourceHash,
      freezeReceiptSha256,
      now: new Date(cutover.startedAt),
    });
    assertOwner(owner.value, cutover.runId);
    assertCompletion(completion.value, cutover.runId);
    const migrationValue = migration.value as MigrationReport;
    if (migrationValue?.status !== 'succeeded' || migrationValue.sourcePath !== '[verified-consistent-snapshot]'
      || migrationValue.targetSchema !== 'consensus'
      || migrationValue.validation !== 'passed' || migrationValue.errors?.length !== 0) {
      throw new Error('Cutover migration artifact is invalid');
    }
    exactPhaseCapture(reports, reportCaptures, validation, 'validation', cutover);
    exactPhaseCapture(reports, reportCaptures, smoke, 'smoke', cutover);
    const receipt = completion.value;
    if (receipt.completedAt !== cutover.finishedAt || receipt.releaseCandidate !== candidate
      || receipt.sourceSnapshotSha256 !== sourceHash || receipt.manifestSha256 !== manifest.sha256
      || receipt.freezeReceiptSha256 !== freezeReceiptSha256
      || receipt.authorizationSha256 !== authorization.sha256 || receipt.ownerReceiptSha256 !== owner.sha256
      || receipt.migrationReportSha256 !== migration.sha256
      || receipt.validationReportSha256 !== validation.sha256 || receipt.smokeReportSha256 !== smoke.sha256) {
      throw new Error('Cutover completion receipt mixes evidence closures');
    }
  }
}
