import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isSafeRunId } from '../backup/publication';
import {
  canonicalUtc,
  exactKeys,
  fixedReceiptError,
  isReceiptArtifact,
  meaningful,
  SHA256,
  type ReceiptArtifact,
} from './deploymentReceiptCommon';
import { captureTrafficAuthorization } from './trafficAuthorization';
import { readStableJson } from './stableJson';

interface ObservationCheck {
  id: string;
  status: 'passed';
}

interface ObservationReceipt {
  version: 1;
  purpose: 'postgresql-first-deployment-observation';
  status: 'completed';
  readinessRunId: string;
  trafficAuthorizationSha256: string;
  startedAt: string;
  finishedAt: string;
  postgresqlBusinessWritesObserved: boolean;
  checks: ObservationCheck[];
  backupRestoreReceipt: ReceiptArtifact;
}

interface BackupRestoreReceipt {
  version: 1;
  purpose: 'postgresql-backup-restore-test';
  status: 'passed';
  readinessRunId: string;
  trafficAuthorizationSha256: string;
  backupId: string;
  restoreTarget: string;
  backupCreatedAt: string;
  startedAt: string;
  finishedAt: string;
  isolatedTarget: true;
}

export interface VerifyObservationReceiptOptions {
  observationPath: string;
  trafficAuthorizationPath: string;
  now?: Date;
}

export interface VerifiedObservationReceipt {
  status: 'passed';
  readinessRunId: string;
  trafficAuthorizationSha256: string;
  durationMinutes: number;
  postgresqlBusinessWritesObserved: boolean;
  backupRestoreReceiptSha256: string;
}

const OBSERVATION_KEYS = [
  'version', 'purpose', 'status', 'readinessRunId', 'trafficAuthorizationSha256', 'startedAt', 'finishedAt',
  'postgresqlBusinessWritesObserved', 'checks', 'backupRestoreReceipt',
] as const;
const RESTORE_KEYS = [
  'version', 'purpose', 'status', 'readinessRunId', 'trafficAuthorizationSha256', 'backupId', 'restoreTarget',
  'backupCreatedAt', 'startedAt', 'finishedAt', 'isolatedTarget',
] as const;
const CHECK_KEYS = ['id', 'status'] as const;
const REQUIRED_CHECKS = [
  'health.recorded', 'pool-saturation.recorded', 'slow-queries.recorded', 'errors.recorded',
  'business-writes.recorded', 'disk-volume.recorded', 'postgresql-backup-restore.passed',
] as const;

function check(value: unknown): value is ObservationCheck {
  return exactKeys(value, CHECK_KEYS) && meaningful(value.id) && value.status === 'passed';
}

function observation(value: unknown): value is ObservationReceipt {
  if (!exactKeys(value, OBSERVATION_KEYS)) return false;
  if (value.version !== 1 || value.purpose !== 'postgresql-first-deployment-observation'
    || value.status !== 'completed' || !isSafeRunId(String(value.readinessRunId || ''))
    || typeof value.trafficAuthorizationSha256 !== 'string' || !SHA256.test(value.trafficAuthorizationSha256)
    || !canonicalUtc(value.startedAt) || !canonicalUtc(value.finishedAt)
    || typeof value.postgresqlBusinessWritesObserved !== 'boolean'
    || !Array.isArray(value.checks) || !value.checks.every(check)
    || !isReceiptArtifact(value.backupRestoreReceipt)) return false;
  const ids = (value.checks as ObservationCheck[]).map((item) => item.id).sort();
  const expected = [...REQUIRED_CHECKS].sort();
  return ids.length === expected.length && new Set(ids).size === ids.length
    && ids.every((id, index) => id === expected[index])
    && Date.parse(String(value.finishedAt)) - Date.parse(String(value.startedAt)) >= 60 * 60 * 1000;
}

function restore(value: unknown, receipt: ObservationReceipt): value is BackupRestoreReceipt {
  if (!exactKeys(value, RESTORE_KEYS)) return false;
  return value.version === 1 && value.purpose === 'postgresql-backup-restore-test' && value.status === 'passed'
    && value.readinessRunId === receipt.readinessRunId
    && value.trafficAuthorizationSha256 === receipt.trafficAuthorizationSha256
    && meaningful(value.backupId) && meaningful(value.restoreTarget)
    && canonicalUtc(value.backupCreatedAt) && canonicalUtc(value.startedAt) && canonicalUtc(value.finishedAt)
    && value.isolatedTarget === true
    && Date.parse(String(value.backupCreatedAt)) >= Date.parse(receipt.startedAt)
    && Date.parse(String(value.startedAt)) >= Date.parse(String(value.backupCreatedAt))
    && Date.parse(String(value.finishedAt)) >= Date.parse(receipt.finishedAt)
    && Date.parse(String(value.finishedAt)) >= Date.parse(String(value.startedAt));
}

async function verify(options: VerifyObservationReceiptOptions): Promise<VerifiedObservationReceipt> {
  const observationPath = path.resolve(options.observationPath);
  const rootPath = path.dirname(observationPath);
  const rootRealPath = await fs.realpath(rootPath);
  const traffic = await captureTrafficAuthorization(options.trafficAuthorizationPath, rootPath, rootRealPath);
  const captured = await readStableJson<unknown>(observationPath, rootPath, rootRealPath);
  if (!observation(captured.value)) throw new Error('invalid observation');
  const receipt = captured.value;
  const now = options.now || new Date();
  if (receipt.readinessRunId !== traffic.value.readinessRunId
    || receipt.trafficAuthorizationSha256 !== traffic.sha256
    || Date.parse(receipt.startedAt) < Date.parse(traffic.value.approvedAt)
    || Date.parse(receipt.finishedAt) > now.getTime()) throw new Error('observation binding mismatch');
  const restorePath = path.resolve(rootPath, ...receipt.backupRestoreReceipt.path.split('/'));
  const restored = await readStableJson<unknown>(restorePath, rootPath, rootRealPath);
  if (restored.sha256 !== receipt.backupRestoreReceipt.sha256
    || restored.sizeBytes !== receipt.backupRestoreReceipt.sizeBytes
    || !restore(restored.value, receipt)) throw new Error('restore receipt mismatch');
  if (Date.parse(restored.value.finishedAt) > now.getTime()) throw new Error('restore receipt is from the future');
  return {
    status: 'passed',
    readinessRunId: receipt.readinessRunId,
    trafficAuthorizationSha256: receipt.trafficAuthorizationSha256,
    durationMinutes: Math.floor((Date.parse(receipt.finishedAt) - Date.parse(receipt.startedAt)) / 60_000),
    postgresqlBusinessWritesObserved: receipt.postgresqlBusinessWritesObserved,
    backupRestoreReceiptSha256: restored.sha256,
  };
}

export async function verifyObservationReceipt(
  options: VerifyObservationReceiptOptions,
): Promise<VerifiedObservationReceipt> {
  try {
    return await verify(options);
  } catch {
    throw fixedReceiptError('OBSERVATION_RECEIPT_INVALID', 'Observation receipt is invalid');
  }
}
