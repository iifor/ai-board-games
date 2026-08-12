import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import test from 'node:test';
import { recordProductionBuildReceipt } from '../../packages/db-migrator/src/release/recordProductionBuild';
import { verifyProductionBuildReceipt } from '../../packages/db-migrator/src/release/productionBuildReceipt';
import {
  CANDIDATE_TREE, createTrafficFixture, OPS_DIGEST, RELEASE_CANDIDATE, RUNTIME_DIGEST, sha256, TOOLING_HEAD,
} from './deploymentGateFixtures';

test('machine recorder atomically creates but never overwrites the typed build receipt', async (t) => {
  const fixture = await createTrafficFixture();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  await fs.rm(fixture.buildReceiptPath);
  const options = {
    outputPath: fixture.buildReceiptPath,
    buildId: fixture.buildReceipt.buildId,
    releaseCandidate: RELEASE_CANDIDATE,
    candidateTree: CANDIDATE_TREE,
    toolingHead: TOOLING_HEAD,
    applicationInputManifestPath: fixture.inputManifestPath,
    applicationInputManifestSha256: fixture.inputManifest.manifestSha256,
    runtimeImageDigest: RUNTIME_DIGEST,
    opsImageDigest: OPS_DIGEST,
    now: new Date(fixture.buildReceipt.builtAt),
  };
  const recorded = await recordProductionBuildReceipt(options);
  assert.equal(recorded.status, 'recorded');
  await assert.rejects(() => recordProductionBuildReceipt(options));
  assert.equal((await fs.readdir(fixture.root)).some((name) => name.includes('.tmp-')), false);
});

test('build verification rejects a receipt whose tree or manifest differs from independent checkout values', async (t) => {
  const fixture = await createTrafficFixture();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  const bytes = await fs.readFile(fixture.buildReceiptPath);
  const base = {
    receiptPath: fixture.buildReceiptPath,
    receiptSha256: sha256(bytes.toString()),
    receiptSizeBytes: bytes.length,
    releaseCandidate: RELEASE_CANDIDATE,
    toolingHead: TOOLING_HEAD,
    runtimeImageDigest: RUNTIME_DIGEST,
    opsImageDigest: OPS_DIGEST,
    runtimeApplicationInputSha256: fixture.inputManifest.manifestSha256,
    expectedCandidateTree: CANDIDATE_TREE,
    expectedApplicationInputSha256: fixture.inputManifest.manifestSha256,
  };
  await assert.rejects(() => verifyProductionBuildReceipt({ ...base, expectedCandidateTree: 'c'.repeat(40) }));
  await assert.rejects(() => verifyProductionBuildReceipt({ ...base, expectedApplicationInputSha256: '8'.repeat(64) }));
});
