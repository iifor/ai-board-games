import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isSafeRunId } from '../backup/publication';
import {
  canonicalUtc, exactKeys, IMAGE_DIGEST, isReceiptArtifact, normalizedRelativePath,
  SHA256, type ReceiptArtifact, validGitSha,
} from './deploymentReceiptCommon';
import { readStableJson } from './stableJson';

const INPUT_PATHS = [
  'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml',
  'packages/shared', 'packages/client', 'packages/admin', 'packages/server',
  'packages/db-migrator/package.json',
] as const;
const ROOT_KEYS = [
  'version', 'purpose', 'status', 'buildId', 'releaseCandidate', 'candidateTree', 'toolingHead',
  'applicationInputManifest', 'applicationInputManifestSha256',
  'runtimeImageDigest', 'opsImageDigest', 'builtAt',
] as const;
const MANIFEST_KEYS = ['version', 'purpose', 'releaseCandidate', 'inputPaths', 'entries', 'manifestSha256'] as const;
const ENTRY_KEYS = ['mode', 'blobSha1', 'path'] as const;
const BLOB_SHA1 = /^[a-f0-9]{40}$/;

interface ApplicationInputEntry { mode: '100644' | '100755' | '120000'; blobSha1: string; path: string }

export interface ApplicationInputManifest {
  version: 1;
  purpose: 'consensus-application-build-inputs';
  releaseCandidate: string;
  inputPaths: string[];
  entries: ApplicationInputEntry[];
  manifestSha256: string;
}

export interface ProductionBuildReceipt {
  version: 1;
  purpose: 'postgresql-production-image-build';
  status: 'built';
  buildId: string;
  releaseCandidate: string;
  candidateTree: string;
  toolingHead: string;
  applicationInputManifest: ReceiptArtifact;
  applicationInputManifestSha256: string;
  runtimeImageDigest: string;
  opsImageDigest: string;
  builtAt: string;
}

export interface VerifyProductionBuildOptions {
  receiptPath: string;
  receiptSha256: string;
  receiptSizeBytes: number;
  releaseCandidate: string;
  toolingHead: string;
  runtimeImageDigest: string;
  opsImageDigest: string;
  runtimeApplicationInputSha256: string;
  expectedCandidateTree: string;
  expectedApplicationInputSha256: string;
}

function validManifest(value: unknown): value is ApplicationInputManifest {
  if (!exactKeys(value, MANIFEST_KEYS) || value.version !== 1
    || value.purpose !== 'consensus-application-build-inputs'
    || !validGitSha(value.releaseCandidate) || !SHA256.test(String(value.manifestSha256))
    || !Array.isArray(value.inputPaths) || value.inputPaths.length !== INPUT_PATHS.length
    || !value.inputPaths.every((item, index) => item === INPUT_PATHS[index])
    || !Array.isArray(value.entries) || value.entries.length === 0) return false;
  const entries = value.entries as unknown[];
  if (!entries.every((entry) => exactKeys(entry, ENTRY_KEYS)
    && ['100644', '100755', '120000'].includes(String(entry.mode))
    && BLOB_SHA1.test(String(entry.blobSha1)) && normalizedRelativePath(entry.path))) return false;
  const typed = entries as ApplicationInputEntry[];
  if (typed.some((entry, index) => index > 0 && typed[index - 1].path >= entry.path)) return false;
  if (!typed.every((entry) => INPUT_PATHS.some((input) => entry.path === input || entry.path.startsWith(`${input}/`)))
    || !INPUT_PATHS.every((input) => typed.some((entry) => entry.path === input || entry.path.startsWith(`${input}/`)))) {
    return false;
  }
  const canonical = typed.map((entry) => `${entry.mode} ${entry.blobSha1}\t${entry.path}\n`).join('');
  return createHash('sha256').update(canonical).digest('hex') === value.manifestSha256;
}

export async function captureApplicationInputManifest(
  candidate: string,
  rootPath?: string,
  rootRealPath?: string,
): Promise<import('./stableJson').StableJson<ApplicationInputManifest>> {
  const manifestPath = path.resolve(candidate);
  const evidenceRoot = rootPath || path.dirname(manifestPath);
  const realRoot = rootRealPath || await fs.realpath(evidenceRoot);
  const captured = await readStableJson<unknown>(manifestPath, evidenceRoot, realRoot);
  if (!validManifest(captured.value)) throw new Error('invalid application input manifest');
  return captured as import('./stableJson').StableJson<ApplicationInputManifest>;
}

function validReceipt(value: unknown): value is ProductionBuildReceipt {
  if (!exactKeys(value, ROOT_KEYS)) return false;
  return value.version === 1 && value.purpose === 'postgresql-production-image-build'
    && value.status === 'built' && isSafeRunId(String(value.buildId || ''))
    && validGitSha(value.releaseCandidate) && validGitSha(value.candidateTree)
    && validGitSha(value.toolingHead) && value.releaseCandidate !== value.toolingHead
    && isReceiptArtifact(value.applicationInputManifest)
    && typeof value.applicationInputManifestSha256 === 'string' && SHA256.test(value.applicationInputManifestSha256)
    && typeof value.runtimeImageDigest === 'string' && IMAGE_DIGEST.test(value.runtimeImageDigest)
    && typeof value.opsImageDigest === 'string' && IMAGE_DIGEST.test(value.opsImageDigest)
    && value.runtimeImageDigest !== value.opsImageDigest && canonicalUtc(value.builtAt);
}

export async function verifyProductionBuildReceipt(options: VerifyProductionBuildOptions): Promise<{
  receiptSha256: string; candidateTree: string; applicationInputManifestSha256: string; builtAt: string;
}> {
  const receiptPath = path.resolve(options.receiptPath);
  const rootPath = path.dirname(receiptPath);
  const rootRealPath = await fs.realpath(rootPath);
  const captured = await readStableJson<unknown>(receiptPath, rootPath, rootRealPath);
  if (!validReceipt(captured.value) || captured.sha256 !== options.receiptSha256
    || captured.sizeBytes !== options.receiptSizeBytes) throw new Error('production build receipt mismatch');
  const receipt = captured.value;
  if (receipt.releaseCandidate !== options.releaseCandidate || receipt.toolingHead !== options.toolingHead
    || receipt.candidateTree !== options.expectedCandidateTree
    || receipt.runtimeImageDigest !== options.runtimeImageDigest || receipt.opsImageDigest !== options.opsImageDigest
    || receipt.applicationInputManifestSha256 !== options.runtimeApplicationInputSha256
    || receipt.applicationInputManifestSha256 !== options.expectedApplicationInputSha256) {
    throw new Error('production build binding mismatch');
  }
  const manifestPath = path.resolve(rootPath, ...receipt.applicationInputManifest.path.split('/'));
  const manifest = await captureApplicationInputManifest(manifestPath, rootPath, rootRealPath);
  if (manifest.sha256 !== receipt.applicationInputManifest.sha256
    || manifest.sizeBytes !== receipt.applicationInputManifest.sizeBytes || !validManifest(manifest.value)
    || manifest.value.releaseCandidate !== receipt.releaseCandidate
    || manifest.value.manifestSha256 !== receipt.applicationInputManifestSha256) {
    throw new Error('production build input manifest mismatch');
  }
  return {
    receiptSha256: captured.sha256,
    candidateTree: receipt.candidateTree,
    applicationInputManifestSha256: receipt.applicationInputManifestSha256,
    builtAt: receipt.builtAt,
  };
}
