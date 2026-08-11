import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isSafeRunId } from '../backup/publication';
import { verifyManifest, type BackupManifest } from '../backup/manifest';
import { captureStableFileContent } from '../backup/fileSnapshot';
import type { ReadinessArtifact } from '../reporting/reportTypes';

export interface ReserveCutoverEvidenceOptions {
  outputDirectory: string;
  runId: string;
  authorizationBytes: Buffer;
  authorizationSha256: string;
  manifestBytes: Buffer;
  manifestSha256: string;
  now: Date;
}

export interface CutoverEvidenceReservation {
  outputDirectory: string;
  ownerReceiptPath: string;
  authorizationPath: string;
  manifestPath: string;
  artifacts: ReadinessArtifact[];
}

export interface VerifiedCutoverSource {
  manifestBytes: Buffer;
  manifestSha256: string;
  sourceSnapshotSha256: string;
}

function cutoverError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await fs.lstat(candidate);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function writeExclusive(candidate: string, bytes: Buffer): Promise<void> {
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  let closed = false;
  try {
    handle = await fs.open(candidate, 'wx', 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    closed = true;
  } catch (error) {
    if (handle && !closed) await handle.close().catch(() => undefined);
    throw error;
  }
}

function runPaths(outputDirectory: string, runId: string): {
  owner: string;
  authorization: string;
  manifest: string;
  all: string[];
} {
  const named = (suffix: string): string => path.join(outputDirectory, `${runId}-${suffix}`);
  const owner = named('owner-receipt.json');
  const authorization = named('authorization.json');
  const manifest = named('manifest.json');
  return {
    owner,
    authorization,
    manifest,
    all: [
      owner, authorization, manifest,
      named('migration.json'), named('validation.json'), named('validation.md'),
      named('smoke.json'), named('smoke.md'), named('cutover.json'), named('cutover.md'),
    ],
  };
}

function artifact(type: ReadinessArtifact['type'], candidate: string, hash: string): ReadinessArtifact {
  return { type, path: path.basename(candidate), sha256: hash };
}

export async function loadVerifiedCutoverSource(
  sourceSnapshotPath: string,
  sourceManifestPath: string,
): Promise<VerifiedCutoverSource> {
  try {
    const manifestPath = path.resolve(sourceManifestPath);
    const root = path.dirname(manifestPath);
    const rootRealPath = await fs.realpath(root);
    const expectedSourcePath = path.join(root, 'sqlite-consistent.sqlite');
    if (path.resolve(sourceSnapshotPath) !== expectedSourcePath) {
      throw new Error('source mismatch');
    }
    const manifestCapture = await captureStableFileContent(
      manifestPath, rootRealPath, path.basename(manifestPath), 'CUTOVER_SOURCE_INVALID',
    );
    const manifest = JSON.parse(manifestCapture.bytes.toString('utf8')) as BackupManifest;
    await verifyManifest(root, manifest);
    const sourceCapture = await captureStableFileContent(
      expectedSourcePath, rootRealPath, 'sqlite-consistent.sqlite', 'CUTOVER_SOURCE_INVALID',
    );
    if (sourceCapture.sha256 !== manifest.consistentDatabaseSha256) throw new Error('hash mismatch');
    const finalManifest = await captureStableFileContent(
      manifestPath, rootRealPath, path.basename(manifestPath), 'CUTOVER_SOURCE_INVALID',
    );
    if (finalManifest.sha256 !== manifestCapture.sha256
      || finalManifest.dev !== manifestCapture.dev || finalManifest.ino !== manifestCapture.ino
      || finalManifest.sizeBytes !== manifestCapture.sizeBytes) throw new Error('manifest changed');
    return {
      manifestBytes: Buffer.from(manifestCapture.bytes),
      manifestSha256: manifestCapture.sha256,
      sourceSnapshotSha256: sourceCapture.sha256,
    };
  } catch {
    throw cutoverError('CUTOVER_SOURCE_INVALID', 'Verified cutover source snapshot or manifest is invalid');
  }
}

export async function reserveCutoverEvidence(
  options: ReserveCutoverEvidenceOptions,
): Promise<CutoverEvidenceReservation> {
  if (!isSafeRunId(options.runId)) {
    throw cutoverError('INVALID_RUN_ID', 'runId must be a safe, non-empty identifier');
  }
  if (sha256(options.authorizationBytes) !== options.authorizationSha256
    || sha256(options.manifestBytes) !== options.manifestSha256) {
    throw cutoverError('CUTOVER_EVIDENCE_CHANGED', 'Verified cutover evidence bytes changed');
  }
  const outputDirectory = path.resolve(options.outputDirectory);
  await fs.mkdir(outputDirectory, { recursive: true });
  const paths = runPaths(outputDirectory, options.runId);
  const ownerReceipt = Buffer.from(`${JSON.stringify({
    version: 1,
    runId: options.runId,
    schema: 'consensus',
    reservedAt: options.now.toISOString(),
    nonce: randomUUID(),
  }, null, 2)}\n`);
  try {
    await writeExclusive(paths.owner, ownerReceipt);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw cutoverError('CUTOVER_RUN_EXISTS', 'Cutover run already has an owner receipt');
    }
    throw error;
  }

  if ((await Promise.all(paths.all.slice(1).map(exists))).some(Boolean)) {
    throw cutoverError('CUTOVER_RUN_EXISTS', 'Cutover run already has preserved evidence');
  }
  try {
    await writeExclusive(paths.authorization, options.authorizationBytes);
    await writeExclusive(paths.manifest, options.manifestBytes);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw cutoverError('CUTOVER_RUN_EXISTS', 'Cutover run already has preserved evidence');
    }
    throw cutoverError('CUTOVER_EVIDENCE_PUBLICATION_FAILED', 'Cutover evidence publication failed');
  }
  return {
    outputDirectory,
    ownerReceiptPath: paths.owner,
    authorizationPath: paths.authorization,
    manifestPath: paths.manifest,
    artifacts: [
      artifact('owner-receipt', paths.owner, sha256(ownerReceipt)),
      artifact('authorization', paths.authorization, options.authorizationSha256),
      artifact('manifest', paths.manifest, options.manifestSha256),
    ],
  };
}
