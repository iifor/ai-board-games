import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { reserveCutoverEvidence } from '../../packages/db-migrator/src/cutover/evidence';

const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

function options(outputDirectory: string, runId = 'cutover-evidence') {
  const authorizationBytes = Buffer.from('{"approved":true}\n');
  const manifestBytes = Buffer.from('{"version":1}\n');
  return {
    outputDirectory, runId, authorizationBytes, manifestBytes,
    authorizationSha256: hash(authorizationBytes), manifestSha256: hash(manifestBytes),
    now: new Date('2026-08-11T04:00:00.000Z'),
  };
}

test('cutover evidence reserves once and publishes immutable owner, authorization, and manifest bytes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cutover-evidence-'));
  try {
    const reserved = await reserveCutoverEvidence(options(root));
    assert.equal(path.dirname(reserved.ownerReceiptPath), path.resolve(root));
    assert.deepEqual(
      reserved.artifacts.map((artifact) => artifact.type),
      ['owner-receipt', 'authorization', 'manifest'],
    );
    for (const artifact of reserved.artifacts) {
      assert.equal(path.isAbsolute(artifact.path), false);
      assert.match(artifact.sha256 || '', /^[a-f0-9]{64}$/);
      assert.equal(hash(await fs.readFile(path.join(root, artifact.path))), artifact.sha256);
    }
    await assert.rejects(
      reserveCutoverEvidence(options(root)),
      (error: unknown) => (error as { code?: string }).code === 'CUTOVER_RUN_EXISTS',
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('cutover evidence allows only one concurrent reservation for the same run', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cutover-evidence-race-'));
  try {
    const results = await Promise.allSettled([
      reserveCutoverEvidence(options(root, 'concurrent-run')),
      reserveCutoverEvidence(options(root, 'concurrent-run')),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    assert.equal((rejected.reason as { code?: string }).code, 'CUTOVER_RUN_EXISTS');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('cutover evidence rejects unsafe run ids, existing reports, and tampered captured bytes without overwrite', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cutover-evidence-unsafe-'));
  try {
    await assert.rejects(
      reserveCutoverEvidence(options(root, '../escape')),
      (error: unknown) => (error as { code?: string }).code === 'INVALID_RUN_ID',
    );
    assert.deepEqual(await fs.readdir(root), []);

    const existing = path.join(root, 'preexisting-cutover.json');
    await fs.writeFile(existing, 'foreign');
    await assert.rejects(
      reserveCutoverEvidence(options(root, 'preexisting')),
      (error: unknown) => (error as { code?: string }).code === 'CUTOVER_RUN_EXISTS',
    );
    assert.equal(await fs.readFile(existing, 'utf8'), 'foreign');

    const tampered = options(root, 'tampered');
    tampered.authorizationSha256 = 'f'.repeat(64);
    await assert.rejects(
      reserveCutoverEvidence(tampered),
      (error: unknown) => (error as { code?: string }).code === 'CUTOVER_EVIDENCE_CHANGED',
    );
    assert.equal((await fs.readdir(root)).some((name) => name.startsWith('tampered-')), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
