import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import test from 'node:test';
import {
  createTrafficFixture, persistTrafficFixture, runTraffic, writeJson,
} from './deploymentGateFixtures';

test('validates independently approved traffic authorization without writing evidence', async (t) => {
  const fixture = await createTrafficFixture();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  const before = (await fs.readdir(fixture.root)).sort();
  const result = await runTraffic(fixture);
  assert.deepEqual(result.exits, [0]);
  assert.equal(JSON.parse(result.stdout[0]).status, 'passed');
  assert.deepEqual((await fs.readdir(fixture.root)).sort(), before);
});

test('traffic authorization fails closed for stale, mismatched, mixed-freeze, or non-16 evidence', async (t) => {
  const cases: Array<[string, (fixture: any) => void, Record<string, string>?]> = [
    ['failed release', (fx) => { fx.release.status = 'failed'; }],
    ['stale', (fx) => { fx.authorization.expiresAt = new Date(Date.now() - 1).toISOString(); }],
    ['candidate mismatch', () => undefined, { releaseCandidate: 'c'.repeat(40) }],
    ['tooling mismatch', () => undefined, { toolingHead: 'd'.repeat(40) }],
    ['runtime mismatch', () => undefined, { runtimeImageDigest: `sha256:${'e'.repeat(64)}` }],
    ['ops mismatch', () => undefined, { opsImageDigest: `sha256:${'f'.repeat(64)}` }],
    ['not 16 gates', (fx) => { fx.release.checks.pop(); }],
    ['mixed freeze', (fx) => { fx.release.freezeReceiptSha256 = 'e'.repeat(64); }],
    ['runtime input mismatch', () => undefined, { runtimeApplicationInputSha256: '9'.repeat(64) }],
    ['candidate tree mismatch', () => undefined, { candidateTree: 'c'.repeat(40) }],
    ['checkout input mismatch', () => undefined, { applicationInputManifestSha256: '8'.repeat(64) }],
    ['build receipt after approval', (fx) => { fx.buildReceipt.builtAt = new Date(Date.parse(fx.authorization.approvedAt) + 1).toISOString(); }],
    ['build candidate mismatch', (fx) => { fx.buildReceipt.releaseCandidate = '9'.repeat(40); }],
    ['approval predates release', (fx) => { fx.authorization.approvals[0].approvedAt = new Date(Date.parse(fx.release.finishedAt) - 1).toISOString(); }],
    ['duplicate identity', (fx) => { fx.authorization.approvals[2].name = fx.authorization.approvals[0].name; }],
    ['candidate is tooling', (fx) => { fx.authorization.toolingHead = fx.authorization.releaseCandidate; }],
    ['same image', (fx) => { fx.authorization.opsImageDigest = fx.authorization.runtimeImageDigest; }],
  ];
  for (const [name, mutate, expected] of cases) {
    const fixture = await createTrafficFixture();
    t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
    mutate(fixture);
    await persistTrafficFixture(fixture);
    await assert.rejects(() => runTraffic(fixture, expected), (error: any) => {
      assert.equal(error.code, 'TRAFFIC_AUTHORIZATION_INVALID', name);
      return true;
    }, name);
  }
});

test('traffic gate rejects missing or hash-mismatched authorization', async (t) => {
  const missing = await createTrafficFixture();
  t.after(() => fs.rm(missing.root, { recursive: true, force: true }));
  await fs.rm(missing.authorizationPath);
  await assert.rejects(() => runTraffic(missing));
  const mismatch = await createTrafficFixture();
  t.after(() => fs.rm(mismatch.root, { recursive: true, force: true }));
  mismatch.authorization.freezeReceipt.sha256 = '0'.repeat(64);
  await writeJson(mismatch.authorizationPath, mismatch.authorization);
  await assert.rejects(() => runTraffic(mismatch));
});
