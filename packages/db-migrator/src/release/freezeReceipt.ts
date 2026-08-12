import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isSafeRunId } from '../backup/publication';
import {
  canonicalUtc,
  exactKeys,
  fixedReceiptError,
  isReceiptArtifact,
  meaningful,
  normalizedRelativePath,
  SHA256,
  type ReceiptArtifact,
  validGitSha,
} from './deploymentReceiptCommon';
import { readStableJson, type StableJson } from './stableJson';

interface FreezeCheck {
  id: 'sqlite-writer.stopped' | 'background-tasks.stopped';
  status: 'passed';
}

interface NamedApproval {
  name: string;
  approvedAt: string;
}

interface MaintenanceAuthorization {
  version: 1;
  purpose: 'postgresql-first-deployment-maintenance';
  status: 'approved';
  changeId: string;
  releaseCandidate: string;
  toolingHead: string;
  approvedAt: string;
  expiresAt: string;
  approver: NamedApproval;
}

export interface FreezeReceipt {
  version: 1;
  purpose: 'postgresql-first-deployment-freeze';
  status: 'frozen';
  changeId: string;
  freezeId: string;
  releaseCandidate: string;
  toolingHead: string;
  frozenAt: string;
  sourceSqliteRelativePath: string;
  resourceRelativePaths: string[];
  maintenanceAuthorization: ReceiptArtifact;
  checks: FreezeCheck[];
  platformApprover: NamedApproval;
}

export interface VerifyFreezeReceiptOptions {
  receiptPath: string;
  receiptSha256: string;
  releaseCandidate: string;
  toolingHead: string;
  freezeId: string;
  sourceSqliteRelativePath: string;
  resourceRelativePaths: string[];
  goLiveOwner: string;
  now?: Date;
}

export interface VerifiedFreezeReceipt {
  status: 'passed';
  changeId: string;
  freezeId: string;
  receiptSha256: string;
  maintenanceAuthorizationSha256: string;
  frozenAt: string;
}

const RECEIPT_KEYS = [
  'version', 'purpose', 'status', 'changeId', 'freezeId', 'releaseCandidate', 'toolingHead', 'frozenAt',
  'sourceSqliteRelativePath', 'resourceRelativePaths', 'maintenanceAuthorization', 'checks', 'platformApprover',
] as const;
const AUTHORIZATION_KEYS = [
  'version', 'purpose', 'status', 'changeId', 'releaseCandidate', 'toolingHead',
  'approvedAt', 'expiresAt', 'approver',
] as const;
const APPROVAL_KEYS = ['name', 'approvedAt'] as const;
const CHECK_KEYS = ['id', 'status'] as const;
const REQUIRED_CHECKS = ['sqlite-writer.stopped', 'background-tasks.stopped'] as const;

function approval(value: unknown): value is NamedApproval {
  return exactKeys(value, APPROVAL_KEYS) && meaningful(value.name) && canonicalUtc(value.approvedAt);
}

function receipt(value: unknown): value is FreezeReceipt {
  if (!exactKeys(value, RECEIPT_KEYS)) return false;
  if (value.version !== 1 || value.purpose !== 'postgresql-first-deployment-freeze' || value.status !== 'frozen'
    || !isSafeRunId(String(value.changeId || '')) || !isSafeRunId(String(value.freezeId || ''))
    || !validGitSha(value.releaseCandidate) || !validGitSha(value.toolingHead)
    || value.releaseCandidate === value.toolingHead || !canonicalUtc(value.frozenAt)
    || !normalizedRelativePath(value.sourceSqliteRelativePath)
    || !Array.isArray(value.resourceRelativePaths) || value.resourceRelativePaths.length === 0
    || !value.resourceRelativePaths.every(normalizedRelativePath)
    || new Set(value.resourceRelativePaths).size !== value.resourceRelativePaths.length
    || !isReceiptArtifact(value.maintenanceAuthorization)
    || !Array.isArray(value.checks) || !approval(value.platformApprover)) return false;
  const checks = value.checks as unknown[];
  if (checks.length !== REQUIRED_CHECKS.length || !checks.every((item) => (
    exactKeys(item, CHECK_KEYS) && REQUIRED_CHECKS.includes(item.id as FreezeCheck['id']) && item.status === 'passed'
  ))) return false;
  const ids = checks.map((item) => (item as FreezeCheck).id);
  return new Set(ids).size === ids.length && REQUIRED_CHECKS.every((id) => ids.includes(id));
}

function maintenance(value: unknown, freeze: FreezeReceipt): value is MaintenanceAuthorization {
  if (!exactKeys(value, AUTHORIZATION_KEYS) || !approval(value.approver)) return false;
  return value.version === 1 && value.purpose === 'postgresql-first-deployment-maintenance'
    && value.status === 'approved' && value.changeId === freeze.changeId
    && value.releaseCandidate === freeze.releaseCandidate && value.toolingHead === freeze.toolingHead
    && canonicalUtc(value.approvedAt) && canonicalUtc(value.expiresAt)
    && value.approver.approvedAt === value.approvedAt
    && Date.parse(String(value.approvedAt)) <= Date.parse(freeze.frozenAt)
    && Date.parse(freeze.frozenAt) < Date.parse(String(value.expiresAt))
    && Date.parse(freeze.platformApprover.approvedAt) >= Date.parse(freeze.frozenAt);
}

export async function captureFreezeReceipt(
  candidate: string,
  rootPath?: string,
  rootRealPath?: string,
): Promise<StableJson<FreezeReceipt>> {
  const receiptPath = path.resolve(candidate);
  const evidenceRoot = rootPath || path.dirname(receiptPath);
  const realRoot = rootRealPath || await fs.realpath(evidenceRoot);
  const captured = await readStableJson<unknown>(receiptPath, evidenceRoot, realRoot);
  if (!receipt(captured.value)) throw new Error('invalid freeze receipt');
  return captured as StableJson<FreezeReceipt>;
}

async function verify(options: VerifyFreezeReceiptOptions): Promise<VerifiedFreezeReceipt> {
  const now = options.now || new Date();
  if (!SHA256.test(options.receiptSha256) || !validGitSha(options.releaseCandidate)
    || !validGitSha(options.toolingHead) || options.releaseCandidate === options.toolingHead
    || !isSafeRunId(options.freezeId) || !normalizedRelativePath(options.sourceSqliteRelativePath)
    || options.resourceRelativePaths.length === 0 || !options.resourceRelativePaths.every(normalizedRelativePath)
    || new Set(options.resourceRelativePaths).size !== options.resourceRelativePaths.length
    || !meaningful(options.goLiveOwner) || !Number.isFinite(now.getTime())) {
    throw new Error('invalid expected freeze binding');
  }
  const receiptPath = path.resolve(options.receiptPath);
  const rootPath = path.dirname(receiptPath);
  const rootRealPath = await fs.realpath(rootPath);
  const captured = await captureFreezeReceipt(receiptPath, rootPath, rootRealPath);
  const freeze = captured.value;
  if (captured.sha256 !== options.receiptSha256 || freeze.releaseCandidate !== options.releaseCandidate
    || freeze.toolingHead !== options.toolingHead || freeze.freezeId !== options.freezeId
    || freeze.sourceSqliteRelativePath !== options.sourceSqliteRelativePath
    || freeze.resourceRelativePaths.length !== options.resourceRelativePaths.length
    || !freeze.resourceRelativePaths.every((item, index) => item === options.resourceRelativePaths[index])
    || freeze.platformApprover.name.trim().toLowerCase() === options.goLiveOwner.trim().toLowerCase()) {
    throw new Error('freeze binding mismatch');
  }
  const authorizationPath = path.resolve(rootPath, ...freeze.maintenanceAuthorization.path.split('/'));
  const authorization = await readStableJson<unknown>(authorizationPath, rootPath, rootRealPath);
  if (authorization.sha256 !== freeze.maintenanceAuthorization.sha256
    || authorization.sizeBytes !== freeze.maintenanceAuthorization.sizeBytes
    || !maintenance(authorization.value, freeze)
    || now.getTime() < Date.parse(freeze.frozenAt)
    || Date.parse(freeze.platformApprover.approvedAt) > now.getTime()
    || now.getTime() >= Date.parse((authorization.value as MaintenanceAuthorization).expiresAt)) {
    throw new Error('maintenance authorization mismatch');
  }
  return {
    status: 'passed',
    changeId: freeze.changeId,
    freezeId: freeze.freezeId,
    receiptSha256: captured.sha256,
    maintenanceAuthorizationSha256: authorization.sha256,
    frozenAt: freeze.frozenAt,
  };
}

export async function verifyFreezeReceipt(options: VerifyFreezeReceiptOptions): Promise<VerifiedFreezeReceipt> {
  try {
    return await verify(options);
  } catch {
    throw fixedReceiptError('FREEZE_RECEIPT_INVALID', 'Freeze receipt is invalid');
  }
}
