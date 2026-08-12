import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isSafeRunId } from '../backup/publication';
import { REQUIRED_RELEASE_CHECKS, type ReleaseReadinessReport } from '../commands/release-readiness';
import { isReadinessReport } from './evidence';
import {
  canonicalUtc,
  exactKeys,
  fixedReceiptError,
  IMAGE_DIGEST,
  isReceiptArtifact,
  meaningful,
  type ReceiptArtifact,
  validGitSha,
} from './deploymentReceiptCommon';
import { readStableJson, type StableJson } from './stableJson';
import { captureFreezeReceipt, verifyFreezeReceipt } from './freezeReceipt';
import { verifyProductionBuildReceipt } from './productionBuildReceipt';
import { hasReleaseEvidenceClosure, verifyReleaseEvidenceClosure } from './releaseClosureVerification';

type ApprovalRole = 'go-live-owner' | 'rollback-owner' | 'independent-reviewer';

interface TrafficApproval {
  role: ApprovalRole;
  name: string;
  approvedAt: string;
}

export interface TrafficAuthorization {
  version: 1;
  purpose: 'postgresql-first-deployment-traffic';
  status: 'approved';
  readinessRunId: string;
  releaseCandidate: string;
  toolingHead: string;
  runtimeImageDigest: string;
  opsImageDigest: string;
  releaseReport: ReceiptArtifact;
  buildReceipt: ReceiptArtifact;
  freezeReceipt: ReceiptArtifact;
  approvals: TrafficApproval[];
  approvedAt: string;
  expiresAt: string;
}

export interface VerifyTrafficAuthorizationOptions {
  authorizationPath: string;
  releaseCandidate: string;
  toolingHead: string;
  runtimeImageDigest: string;
  opsImageDigest: string;
  runtimeApplicationInputSha256: string;
  expectedCandidateTree: string;
  expectedApplicationInputSha256: string;
  now?: Date;
}

export interface VerifiedTrafficAuthorization {
  status: 'passed';
  readinessRunId: string;
  releaseCandidate: string;
  toolingHead: string;
  runtimeImageDigest: string;
  opsImageDigest: string;
  authorizationSha256: string;
  releaseReportSha256: string;
  freezeReceiptSha256: string;
  buildReceiptSha256: string;
  candidateTree: string;
  applicationInputManifestSha256: string;
  expiresAt: string;
}

const AUTHORIZATION_KEYS = [
  'version', 'purpose', 'status', 'readinessRunId', 'releaseCandidate', 'toolingHead',
  'runtimeImageDigest', 'opsImageDigest', 'releaseReport', 'freezeReceipt', 'approvals', 'approvedAt', 'expiresAt',
  'buildReceipt',
] as const;
const APPROVAL_KEYS = ['role', 'name', 'approvedAt'] as const;
const APPROVAL_ROLES: ApprovalRole[] = ['go-live-owner', 'rollback-owner', 'independent-reviewer'];

function approval(value: unknown): value is TrafficApproval {
  if (!exactKeys(value, APPROVAL_KEYS)) return false;
  return APPROVAL_ROLES.includes(value.role as ApprovalRole)
    && meaningful(value.name)
    && canonicalUtc(value.approvedAt);
}

export function isTrafficAuthorization(value: unknown): value is TrafficAuthorization {
  if (!exactKeys(value, AUTHORIZATION_KEYS)) return false;
  if (value.version !== 1 || value.purpose !== 'postgresql-first-deployment-traffic'
    || value.status !== 'approved' || !isSafeRunId(String(value.readinessRunId || ''))
    || !validGitSha(value.releaseCandidate) || !validGitSha(value.toolingHead)
    || typeof value.runtimeImageDigest !== 'string' || !IMAGE_DIGEST.test(value.runtimeImageDigest)
    || typeof value.opsImageDigest !== 'string' || !IMAGE_DIGEST.test(value.opsImageDigest)
    || !isReceiptArtifact(value.releaseReport) || !isReceiptArtifact(value.freezeReceipt)
    || !isReceiptArtifact(value.buildReceipt)
    || !Array.isArray(value.approvals) || value.approvals.length !== APPROVAL_ROLES.length
    || !value.approvals.every(approval) || !canonicalUtc(value.approvedAt) || !canonicalUtc(value.expiresAt)) return false;
  const approvals = value.approvals as TrafficApproval[];
  const roles = approvals.map((item) => item.role);
  const identities = approvals.map((item) => item.name.trim().toLowerCase());
  return APPROVAL_ROLES.every((role) => roles.filter((item) => item === role).length === 1)
    && new Set(identities).size === identities.length
    && value.releaseCandidate !== value.toolingHead
    && value.runtimeImageDigest !== value.opsImageDigest
    && approvals.every((item) => Date.parse(item.approvedAt) <= Date.parse(String(value.approvedAt)))
    && Date.parse(String(value.approvedAt)) < Date.parse(String(value.expiresAt));
}

function exactReleaseReport(value: unknown, authorization: TrafficAuthorization): value is ReleaseReadinessReport {
  if (!isReadinessReport(value)) return false;
  const report = value as ReleaseReadinessReport;
  const expected = [...REQUIRED_RELEASE_CHECKS].sort();
  const actual = report.checks.map((check) => check.id).sort();
  return report.stage === 'release' && report.status === 'passed'
    && report.runId === authorization.readinessRunId
    && report.releaseCandidate === authorization.releaseCandidate
    && report.freezeReceiptSha256 === authorization.freezeReceipt.sha256
    && hasReleaseEvidenceClosure(report.evidenceClosure)
    && canonicalUtc(report.startedAt) && canonicalUtc(report.finishedAt)
    && Date.parse(report.finishedAt) <= Date.parse(authorization.approvedAt)
    && authorization.approvals.every((approval) => Date.parse(approval.approvedAt) >= Date.parse(report.finishedAt))
    && report.errors.length === 0 && report.checks.length === REQUIRED_RELEASE_CHECKS.length
    && new Set(actual).size === actual.length
    && actual.every((id, index) => id === expected[index])
    && report.checks.every((check) => check.status === 'passed');
}

export async function captureTrafficAuthorization(
  candidate: string,
  rootPath?: string,
  rootRealPath?: string,
): Promise<StableJson<TrafficAuthorization>> {
  const authorizationPath = path.resolve(candidate);
  const evidenceRoot = rootPath || path.dirname(authorizationPath);
  const realRoot = rootRealPath || await fs.realpath(evidenceRoot);
  const capture = await readStableJson<unknown>(authorizationPath, evidenceRoot, realRoot);
  if (!isTrafficAuthorization(capture.value)) throw new Error('invalid traffic authorization');
  return capture as StableJson<TrafficAuthorization>;
}

async function verify(options: VerifyTrafficAuthorizationOptions): Promise<VerifiedTrafficAuthorization> {
  const now = options.now || new Date();
  if (!validGitSha(options.releaseCandidate) || !validGitSha(options.toolingHead)
    || !IMAGE_DIGEST.test(options.runtimeImageDigest) || !IMAGE_DIGEST.test(options.opsImageDigest)) {
    throw new Error('invalid expected binding');
  }
  const authorizationPath = path.resolve(options.authorizationPath);
  const rootPath = path.dirname(authorizationPath);
  const rootRealPath = await fs.realpath(rootPath);
  const captured = await captureTrafficAuthorization(authorizationPath, rootPath, rootRealPath);
  const authorization = captured.value;
  if (!validGitSha(options.expectedCandidateTree)
    || !/^[a-f0-9]{64}$/.test(options.runtimeApplicationInputSha256)
    || !/^[a-f0-9]{64}$/.test(options.expectedApplicationInputSha256)) {
    throw new Error('invalid runtime application input binding');
  }
  if (authorization.releaseCandidate !== options.releaseCandidate || authorization.toolingHead !== options.toolingHead
    || authorization.runtimeImageDigest !== options.runtimeImageDigest
    || authorization.opsImageDigest !== options.opsImageDigest
    || Date.parse(authorization.approvedAt) > now.getTime() || now.getTime() >= Date.parse(authorization.expiresAt)) {
    throw new Error('traffic binding mismatch');
  }
  const releasePath = path.resolve(rootPath, ...authorization.releaseReport.path.split('/'));
  const release = await readStableJson<unknown>(releasePath, rootPath, rootRealPath);
  if (release.sha256 !== authorization.releaseReport.sha256
    || release.sizeBytes !== authorization.releaseReport.sizeBytes
    || !exactReleaseReport(release.value, authorization)) throw new Error('release report mismatch');
  await verifyReleaseEvidenceClosure(release.value as ReleaseReadinessReport, rootPath);
  const buildPath = path.resolve(rootPath, ...authorization.buildReceipt.path.split('/'));
  const build = await verifyProductionBuildReceipt({
    receiptPath: buildPath,
    receiptSha256: authorization.buildReceipt.sha256,
    receiptSizeBytes: authorization.buildReceipt.sizeBytes,
    releaseCandidate: authorization.releaseCandidate,
    toolingHead: authorization.toolingHead,
    runtimeImageDigest: authorization.runtimeImageDigest,
    opsImageDigest: authorization.opsImageDigest,
    runtimeApplicationInputSha256: options.runtimeApplicationInputSha256,
    expectedCandidateTree: options.expectedCandidateTree,
    expectedApplicationInputSha256: options.expectedApplicationInputSha256,
  });
  if (Date.parse(build.builtAt) > Date.parse(authorization.approvedAt)) {
    throw new Error('production build receipt postdates traffic approval');
  }
  const freezePath = path.resolve(rootPath, ...authorization.freezeReceipt.path.split('/'));
  const freeze = await captureFreezeReceipt(freezePath, rootPath, rootRealPath);
  const goLiveOwner = authorization.approvals.find((approval) => approval.role === 'go-live-owner')?.name || '';
  if (freeze.sha256 !== authorization.freezeReceipt.sha256
    || freeze.sizeBytes !== authorization.freezeReceipt.sizeBytes
    || freeze.value.releaseCandidate !== authorization.releaseCandidate
    || freeze.value.toolingHead !== authorization.toolingHead) throw new Error('freeze receipt mismatch');
  await verifyFreezeReceipt({
    receiptPath: freezePath,
    receiptSha256: freeze.sha256,
    releaseCandidate: authorization.releaseCandidate,
    toolingHead: authorization.toolingHead,
    freezeId: freeze.value.freezeId,
    sourceSqliteRelativePath: freeze.value.sourceSqliteRelativePath,
    resourceRelativePaths: freeze.value.resourceRelativePaths,
    goLiveOwner,
    now,
  });
  return {
    status: 'passed',
    readinessRunId: authorization.readinessRunId,
    releaseCandidate: authorization.releaseCandidate,
    toolingHead: authorization.toolingHead,
    runtimeImageDigest: authorization.runtimeImageDigest,
    opsImageDigest: authorization.opsImageDigest,
    authorizationSha256: captured.sha256,
    releaseReportSha256: release.sha256,
    freezeReceiptSha256: freeze.sha256,
    buildReceiptSha256: build.receiptSha256,
    candidateTree: build.candidateTree,
    applicationInputManifestSha256: build.applicationInputManifestSha256,
    expiresAt: authorization.expiresAt,
  };
}

export async function verifyTrafficAuthorization(
  options: VerifyTrafficAuthorizationOptions,
): Promise<VerifiedTrafficAuthorization> {
  try {
    return await verify(options);
  } catch {
    throw fixedReceiptError('TRAFFIC_AUTHORIZATION_INVALID', 'Traffic authorization is invalid');
  }
}
