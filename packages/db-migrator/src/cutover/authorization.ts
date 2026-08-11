import { promises as fs } from 'node:fs';
import path from 'node:path';
import { captureStableFileContent } from '../backup/fileSnapshot';
import {
  CUTOVER_APPROVAL_ROLES,
  CUTOVER_TARGET,
  type CutoverAuthorization,
  type LoadCutoverAuthorizationOptions,
  type LoadedCutoverAuthorization,
} from './types';

const MAX_AUTHORIZATION_BYTES = 1024 * 1024;
const GIT_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const ROOT_KEYS = [
  'version', 'purpose', 'status', 'approved', 'releaseCandidate', 'cutoverRunId',
  'backupManifestSha256', 'sourceSnapshotSha256', 'target', 'maintenanceWindow', 'approvals',
] as const;
const TARGET_KEYS = ['database', 'schema', 'role', 'host', 'port', 'tlsMode'] as const;
const WINDOW_KEYS = ['startsAt', 'endsAt'] as const;
const APPROVAL_KEYS = ['role', 'name', 'approvedAt'] as const;

function invalid(): Error & { code: 'CUTOVER_AUTHORIZATION_INVALID' } {
  return Object.assign(new Error('Pre-cutover authorization is invalid'), {
    code: 'CUTOVER_AUTHORIZATION_INVALID' as const,
  });
}

function exactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return keys.length === wanted.length && keys.every((key, index) => key === wanted[index]);
}

function validGitSha(value: unknown): value is string {
  return typeof value === 'string' && GIT_SHA.test(value) && !/^0{40}$/.test(value);
}

function validSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value) && !/^0{64}$/.test(value);
}

function timestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function realIdentity(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  const normalized = value.trim();
  return !normalized.startsWith('REPLACE_WITH_')
    && !/^<.*>$/.test(normalized)
    && !/^(?:placeholder|todo|tbd|unknown|n\/a)$/i.test(normalized);
}

function validateShape(
  candidate: unknown,
  options: LoadCutoverAuthorizationOptions,
): candidate is CutoverAuthorization {
  if (!exactKeys(candidate, ROOT_KEYS)) return false;
  if (candidate.version !== 1 || candidate.purpose !== 'production-cutover'
    || candidate.status !== 'approved' || candidate.approved !== true) return false;
  if (!validGitSha(candidate.releaseCandidate) || candidate.releaseCandidate !== options.releaseCandidate
    || candidate.cutoverRunId !== options.runId
    || !validSha256(candidate.backupManifestSha256)
    || candidate.backupManifestSha256 !== options.manifestSha256
    || !validSha256(candidate.sourceSnapshotSha256)
    || candidate.sourceSnapshotSha256 !== options.sourceSnapshotSha256) return false;

  if (!exactKeys(candidate.target, TARGET_KEYS)) return false;
  const target = candidate.target;
  if (TARGET_KEYS.some((key) => target[key] !== CUTOVER_TARGET[key])) return false;

  if (!exactKeys(candidate.maintenanceWindow, WINDOW_KEYS)) return false;
  const startsAt = timestamp(candidate.maintenanceWindow.startsAt);
  const endsAt = timestamp(candidate.maintenanceWindow.endsAt);
  const now = options.now.getTime();
  if (startsAt === null || endsAt === null || !Number.isFinite(now)
    || startsAt >= endsAt || now < startsAt || now > endsAt) return false;

  if (!Array.isArray(candidate.approvals) || candidate.approvals.length !== CUTOVER_APPROVAL_ROLES.length) return false;
  const names = new Set<string>();
  for (let index = 0; index < CUTOVER_APPROVAL_ROLES.length; index += 1) {
    const approval = candidate.approvals[index];
    if (!exactKeys(approval, APPROVAL_KEYS) || approval.role !== CUTOVER_APPROVAL_ROLES[index]
      || !realIdentity(approval.name)) return false;
    const approvedAt = timestamp(approval.approvedAt);
    if (approvedAt === null || approvedAt > now + 5 * 60_000) return false;
    names.add(approval.name.trim().toLowerCase());
  }
  return names.size === CUTOVER_APPROVAL_ROLES.length;
}

export async function loadCutoverAuthorization(
  options: LoadCutoverAuthorizationOptions,
): Promise<LoadedCutoverAuthorization> {
  try {
    const resolvedPath = path.resolve(options.authorizationPath);
    const root = path.dirname(resolvedPath);
    const rootRealPath = await fs.realpath(root);
    const captured = await captureStableFileContent(
      resolvedPath,
      rootRealPath,
      path.basename(resolvedPath),
      'CUTOVER_AUTHORIZATION_INVALID',
      MAX_AUTHORIZATION_BYTES,
    );
    let candidate: unknown;
    try {
      candidate = JSON.parse(captured.bytes.toString('utf8')) as unknown;
    } catch {
      throw invalid();
    }
    if (!validateShape(candidate, options)) throw invalid();
    return {
      authorization: candidate,
      resolvedPath,
      sizeBytes: captured.sizeBytes,
      sha256: captured.sha256,
      bytes: captured.bytes,
    };
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === 'CUTOVER_AUTHORIZATION_INVALID') throw error;
    throw invalid();
  }
}
