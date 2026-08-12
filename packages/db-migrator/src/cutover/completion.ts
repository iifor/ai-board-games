import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ReadinessArtifact } from '../reporting/reportTypes';
import { CUTOVER_TARGET, type CutoverOptions } from './types';

interface CutoverCompletionReceipt {
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

interface PreparedCutoverCompletion {
  artifact: ReadinessArtifact;
  bytes: Buffer;
  path: string;
  receipt: CutoverCompletionReceipt;
}

function requiredHash(artifacts: ReadinessArtifact[], type: ReadinessArtifact['type']): string {
  const matching = artifacts.filter((artifact) => artifact.type === type);
  if (matching.length !== 1 || !/^[a-f0-9]{64}$/.test(matching[0].sha256 || '')) {
    throw Object.assign(new Error('Cutover completion evidence is incomplete'), {
      code: 'CUTOVER_COMPLETION_INVALID',
    });
  }
  return matching[0].sha256!;
}

function prepareCutoverCompletion(
  options: CutoverOptions,
  artifacts: ReadinessArtifact[],
  sourceSnapshotSha256: string,
  completedAt: Date,
): PreparedCutoverCompletion {
  const receipt: CutoverCompletionReceipt = {
    version: 1,
    purpose: 'production-cutover-completion',
    runId: options.runId,
    schema: 'consensus',
    releaseCandidate: options.releaseCandidate,
    sourceSnapshotSha256,
    freezeReceiptSha256: options.freezeReceiptSha256,
    manifestSha256: requiredHash(artifacts, 'manifest'),
    authorizationSha256: requiredHash(artifacts, 'authorization'),
    ownerReceiptSha256: requiredHash(artifacts, 'owner-receipt'),
    migrationReportSha256: requiredHash(artifacts, 'migration-report'),
    validationReportSha256: requiredHash(artifacts, 'validation-report'),
    smokeReportSha256: requiredHash(artifacts, 'smoke-report'),
    target: CUTOVER_TARGET,
    completedAt: completedAt.toISOString(),
  };
  const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
  const candidate = path.join(
    path.resolve(options.outputDirectory),
    `${options.runId}-completion-receipt.json`,
  );
  return {
    artifact: {
      type: 'completion-receipt',
      path: path.basename(candidate),
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
    bytes,
    path: candidate,
    receipt,
  };
}

async function publishCutoverCompletion(completion: PreparedCutoverCompletion): Promise<void> {
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  let created = false;
  try {
    handle = await fs.open(completion.path, 'wx', 0o600);
    created = true;
    await handle.writeFile(completion.bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
  } catch {
    await handle?.close().catch(() => undefined);
    if (created) await fs.rm(completion.path, { force: true }).catch(() => undefined);
    throw Object.assign(new Error('Production cutover completion publication failed'), {
      code: 'CUTOVER_COMPLETION_PUBLICATION_FAILED',
    });
  }
}

export { prepareCutoverCompletion, publishCutoverCompletion };
export type { CutoverCompletionReceipt, PreparedCutoverCompletion };
