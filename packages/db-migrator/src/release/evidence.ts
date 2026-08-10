import { createHash } from 'node:crypto';
import { constants as fsConstants, promises as fs } from 'node:fs';
import path from 'node:path';
import { captureStableFile } from '../backup/fileSnapshot';
import { isSafeRunId } from '../backup/publication';
import type { ArtifactType, ReadinessReport } from '../reporting/reportTypes';

const SHA256 = /^[a-f0-9]{64}$/;
const STAGES = ['preflight', 'backup', 'import', 'validation', 'rehearsal', 'smoke', 'release'];
const CHECK_STATUSES = ['passed', 'failed', 'skipped'];
const ARTIFACT_TYPES: ArtifactType[] = [
  'backup', 'manifest', 'migration-report', 'validation-report', 'rehearsal-report', 'smoke-report', 'evidence',
];
const GIT_SHA = /^[a-f0-9]{40}$/;

function validGitSha(value: unknown): value is string {
  return typeof value === 'string' && GIT_SHA.test(value) && !/^0{40}$/.test(value);
}

export interface ReportManifestEntry { path: string; sizeBytes: number; sha256: string }
export interface OperatorSignoff {
  releaseCandidate: string;
  readinessRunId: string;
  goLiveOwner: { name: string; approvedAt: string };
  rollbackOwner: { name: string; approvedAt: string };
  maintenanceWindowMinutes: number;
  status: 'approved';
  version: 1;
  approved: boolean;
  approvedBy: string;
  approvedAt: string;
  checks: Array<{ id: string; status: 'passed' | 'failed' }>;
  reportManifest: ReportManifestEntry[];
}

interface StableJson<T> { value: T; sha256: string; sizeBytes: number; resolvedPath: string }

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function sameFile(left: { dev: bigint; ino: bigint; size: bigint; mtimeNs: bigint }, right: typeof left): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeNs === right.mtimeNs;
}

async function readStableJson<T>(candidate: string, rootPath: string, rootRealPath: string): Promise<StableJson<T>> {
  const resolvedPath = path.resolve(candidate);
  if (!isInside(rootPath, resolvedPath)) throw new Error('Evidence path escapes the signoff directory');
  const before = await fs.lstat(resolvedPath, { bigint: true });
  if (before.isSymbolicLink() || !before.isFile()) throw new Error('Evidence must be a regular non-reparse file');
  const beforeRealPath = await fs.realpath(resolvedPath);
  if (!isInside(rootRealPath, beforeRealPath)) throw new Error('Evidence resolves outside the signoff directory');
  const handle = await fs.open(resolvedPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
  let bytes: Buffer;
  try {
    const opened = await handle.stat({ bigint: true });
    if (!sameFile(before, opened)) throw new Error('Evidence changed while opening');
    bytes = await handle.readFile();
    const afterRead = await handle.stat({ bigint: true });
    if (!sameFile(opened, afterRead) || BigInt(bytes.length) !== opened.size) throw new Error('Evidence changed while reading');
  } finally {
    await handle.close();
  }
  const after = await fs.lstat(resolvedPath, { bigint: true });
  const afterRealPath = await fs.realpath(resolvedPath);
  if (!sameFile(before, after) || afterRealPath !== beforeRealPath) throw new Error('Evidence path changed after reading');
  return {
    value: JSON.parse(bytes.toString('utf8')) as T,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.length,
    resolvedPath,
  };
}

function safeManifestPath(candidate: string): boolean {
  return Boolean(candidate) && !candidate.includes('\\') && !path.posix.isAbsolute(candidate)
    && path.posix.normalize(candidate) === candidate && candidate !== '..' && !candidate.startsWith('../');
}

function pathKey(candidate: string): string {
  const resolved = path.resolve(candidate);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}

function validApprovalTime(value: unknown): value is string {
  return nonEmpty(value) && Number.isFinite(Date.parse(value)) && Date.parse(value) > 0;
}

function operatorIdentity(value: unknown): value is string {
  return nonEmpty(value) && !value.trim().startsWith('REPLACE_WITH_') && !/^<.*>$/.test(value.trim());
}

function approvedOwner(value: unknown): value is { name: string; approvedAt: string } {
  if (!value || typeof value !== 'object') return false;
  const owner = value as { name?: unknown; approvedAt?: unknown };
  return operatorIdentity(owner.name) && validApprovalTime(owner.approvedAt);
}

function isReadinessReport(value: unknown): value is ReadinessReport {
  if (!value || typeof value !== 'object') return false;
  const report = value as Partial<ReadinessReport>;
  return nonEmpty(report.runId) && isSafeRunId(report.runId)
    && STAGES.includes(report.stage || '') && ['passed', 'failed'].includes(report.status || '')
    && nonEmpty(report.startedAt) && Number.isFinite(Date.parse(report.startedAt))
    && nonEmpty(report.finishedAt) && Number.isFinite(Date.parse(report.finishedAt))
    && Number.isFinite(report.durationMs) && Number(report.durationMs) >= 0
    && (report.schema === undefined || nonEmpty(report.schema))
    && Array.isArray(report.checks) && report.checks.every((check) => (
      check && nonEmpty(check.id) && CHECK_STATUSES.includes(check.status) && nonEmpty(check.message)
      && (check.expected === undefined || typeof check.expected === 'string')
      && (check.actual === undefined || typeof check.actual === 'string')
    ))
    && Array.isArray(report.artifacts) && report.artifacts.every((artifact) => (
      artifact && ARTIFACT_TYPES.includes(artifact.type) && nonEmpty(artifact.path)
      && (artifact.sha256 === undefined || SHA256.test(artifact.sha256))
    ))
    && Array.isArray(report.errors) && report.errors.every((error) => error && nonEmpty(error.code) && nonEmpty(error.message));
}

function isSignoff(value: unknown): value is OperatorSignoff {
  if (!value || typeof value !== 'object') return false;
  const signoff = value as Partial<OperatorSignoff>;
  if (!validGitSha(signoff.releaseCandidate) || !isSafeRunId(signoff.readinessRunId || '')) return false;
  if (!approvedOwner(signoff.goLiveOwner) || !approvedOwner(signoff.rollbackOwner)
    || signoff.goLiveOwner.name.trim().toLowerCase() === signoff.rollbackOwner.name.trim().toLowerCase()) return false;
  if (!operatorIdentity(signoff.approvedBy) || !validApprovalTime(signoff.approvedAt)) return false;
  const independent = signoff.approvedBy.trim().toLowerCase();
  if ([signoff.goLiveOwner.name, signoff.rollbackOwner.name].some((name) => name.trim().toLowerCase() === independent)) return false;
  return signoff.version === 1 && signoff.approved === true && signoff.status === 'approved'
    && Number.isSafeInteger(signoff.maintenanceWindowMinutes) && Number(signoff.maintenanceWindowMinutes) >= 0
    && Array.isArray(signoff.checks) && signoff.checks.every((check) => (
      check && nonEmpty(check.id) && ['passed', 'failed'].includes(check.status)
    ))
    && Array.isArray(signoff.reportManifest) && signoff.reportManifest.every((entry) => (
      entry && safeManifestPath(entry.path) && Number.isSafeInteger(entry.sizeBytes) && entry.sizeBytes >= 0
      && SHA256.test(entry.sha256)
    ));
}

function assertRequiredArtifacts(report: ReadinessReport): void {
  const counts = new Map<ArtifactType, number>();
  for (const artifact of report.artifacts) counts.set(artifact.type, (counts.get(artifact.type) || 0) + 1);
  const check = (id: string): boolean => report.checks.some((item) => item.id === id);
  if (report.stage === 'rehearsal') {
    for (const type of ['migration-report', 'validation-report', 'smoke-report'] as const) {
      if (counts.get(type) !== 1) throw new Error('Rehearsal artifact evidence is incomplete');
    }
  }
  if (report.stage === 'backup' && (check('backup.execute') || check('backup.restore-drill'))) {
    if ((counts.get('backup') || 0) < 1 || counts.get('manifest') !== 1) {
      throw new Error('Backup artifact evidence is incomplete');
    }
  }
}

export async function loadReleaseEvidence(
  reportPaths: string[],
  operatorSignoffPath: string,
): Promise<{ reports: ReadinessReport[]; signoff: OperatorSignoff }> {
  const signoffPath = path.resolve(operatorSignoffPath);
  const rootPath = path.dirname(signoffPath);
  const rootRealPath = await fs.realpath(rootPath);
  const signoffCapture = await readStableJson<unknown>(signoffPath, rootPath, rootRealPath);
  if (!isSignoff(signoffCapture.value)) throw new Error('Operator signoff is malformed');
  const signoff = signoffCapture.value;
  const manifest = new Map<string, ReportManifestEntry>();
  for (const entry of signoff.reportManifest) {
    const key = pathKey(path.resolve(rootPath, ...entry.path.split('/')));
    if (manifest.has(key)) throw new Error('Signed manifest paths are duplicated');
    manifest.set(key, entry);
  }

  const supplied = reportPaths.map((candidate) => path.resolve(candidate));
  if (new Set(supplied.map(pathKey)).size !== supplied.length) throw new Error('Supplied report paths are duplicated');
  const reports: ReadinessReport[] = [];
  const reportCaptures: StableJson<ReadinessReport>[] = [];
  const claimed = new Set<string>();
  for (const candidate of supplied) {
    const key = pathKey(candidate);
    const expected = manifest.get(key);
    if (!expected) throw new Error('Supplied report is absent from the signed manifest');
    const captured = await readStableJson<unknown>(candidate, rootPath, rootRealPath);
    if (captured.sha256 !== expected.sha256 || captured.sizeBytes !== expected.sizeBytes || !isReadinessReport(captured.value)) {
      throw new Error('Report bytes or shape are invalid');
    }
    reports.push(captured.value);
    reportCaptures.push(captured as StableJson<ReadinessReport>);
    claimed.add(key);
  }

  const artifactClaims = new Set<string>();
  for (let index = 0; index < reports.length; index += 1) {
    const report = reports[index];
    assertRequiredArtifacts(report);
    for (const artifact of report.artifacts) {
      const candidate = path.resolve(path.dirname(reportCaptures[index].resolvedPath), artifact.path);
      if (!isInside(rootPath, candidate)) throw new Error('Artifact path escapes the signoff directory');
      const key = pathKey(candidate);
      if (artifactClaims.has(key)) throw new Error('Artifact path is claimed more than once');
      artifactClaims.add(key);
      const expected = manifest.get(key);
      if (!expected) throw new Error('Artifact is absent from the signed manifest');
      const captured = await captureStableFile(candidate, rootRealPath, path.basename(candidate), 'RELEASE_EVIDENCE_CHANGED');
      if (captured.sizeBytes !== expected.sizeBytes || captured.sha256 !== expected.sha256
        || (artifact.sha256 !== undefined && artifact.sha256 !== captured.sha256)) {
        throw new Error('Artifact bytes do not match signed evidence');
      }
      claimed.add(key);
    }
  }
  if (claimed.size !== manifest.size || [...manifest.keys()].some((key) => !claimed.has(key))) {
    throw new Error('Signed manifest does not exactly cover reports and artifacts');
  }
  return { reports, signoff };
}
