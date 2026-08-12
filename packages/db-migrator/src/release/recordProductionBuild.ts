import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isSafeRunId } from '../backup/publication';
import { writeJsonArtifactExclusive } from '../reporting/reportWriter';
import { IMAGE_DIGEST, SHA256, validGitSha } from './deploymentReceiptCommon';
import {
  captureApplicationInputManifest,
  type ProductionBuildReceipt,
  verifyProductionBuildReceipt,
} from './productionBuildReceipt';

export interface RecordProductionBuildOptions {
  outputPath: string;
  buildId: string;
  releaseCandidate: string;
  candidateTree: string;
  toolingHead: string;
  applicationInputManifestPath: string;
  applicationInputManifestSha256: string;
  runtimeImageDigest: string;
  opsImageDigest: string;
  now?: Date;
}

function relativeArtifactPath(root: string, candidate: string): string {
  const relative = path.relative(root, candidate).split(path.sep).join('/');
  if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
    throw new Error('application input manifest must be beside the build receipt');
  }
  return relative;
}

export async function recordProductionBuildReceipt(options: RecordProductionBuildOptions) {
  const now = options.now || new Date();
  if (!isSafeRunId(options.buildId) || !validGitSha(options.releaseCandidate)
    || !validGitSha(options.candidateTree) || !validGitSha(options.toolingHead)
    || options.releaseCandidate === options.toolingHead
    || !SHA256.test(options.applicationInputManifestSha256)
    || !IMAGE_DIGEST.test(options.runtimeImageDigest) || !IMAGE_DIGEST.test(options.opsImageDigest)
    || options.runtimeImageDigest === options.opsImageDigest || !Number.isFinite(now.getTime())) {
    throw new Error('invalid production build binding');
  }
  const outputPath = path.resolve(options.outputPath);
  const rootPath = path.dirname(outputPath);
  await fs.mkdir(rootPath, { recursive: true, mode: 0o700 });
  const rootRealPath = await fs.realpath(rootPath);
  const manifest = await captureApplicationInputManifest(
    path.resolve(options.applicationInputManifestPath), rootPath, rootRealPath,
  );
  if (manifest.value.releaseCandidate !== options.releaseCandidate
    || manifest.value.manifestSha256 !== options.applicationInputManifestSha256) {
    throw new Error('application input manifest binding mismatch');
  }
  const payload: ProductionBuildReceipt = {
    version: 1,
    purpose: 'postgresql-production-image-build',
    status: 'built',
    buildId: options.buildId,
    releaseCandidate: options.releaseCandidate,
    candidateTree: options.candidateTree,
    toolingHead: options.toolingHead,
    applicationInputManifest: {
      path: relativeArtifactPath(rootPath, manifest.resolvedPath),
      sha256: manifest.sha256,
      sizeBytes: manifest.sizeBytes,
    },
    applicationInputManifestSha256: options.applicationInputManifestSha256,
    runtimeImageDigest: options.runtimeImageDigest,
    opsImageDigest: options.opsImageDigest,
    builtAt: now.toISOString(),
  };
  await writeJsonArtifactExclusive({ finalPath: outputPath, payload });
  const stat = await fs.stat(outputPath);
  const receipt = await verifyProductionBuildReceipt({
    receiptPath: outputPath,
    receiptSha256: await fs.readFile(outputPath).then((bytes) => createHash('sha256').update(bytes).digest('hex')),
    receiptSizeBytes: stat.size,
    releaseCandidate: options.releaseCandidate,
    toolingHead: options.toolingHead,
    runtimeImageDigest: options.runtimeImageDigest,
    opsImageDigest: options.opsImageDigest,
    runtimeApplicationInputSha256: options.applicationInputManifestSha256,
    expectedCandidateTree: options.candidateTree,
    expectedApplicationInputSha256: options.applicationInputManifestSha256,
  });
  return { status: 'recorded' as const, ...receipt, sizeBytes: stat.size };
}
