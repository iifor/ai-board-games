import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import test from 'node:test';
import {
  createTrafficFixture, runTraffic, writeJson,
} from './deploymentGateFixtures';

test('rejects a self-declared 16-of-16 release without signed upstream evidence', async (t) => {
  const fixture = await createTrafficFixture();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  const before = (await fs.readdir(fixture.root)).sort();
  await assert.rejects(() => runTraffic(fixture), (error: any) => {
    assert.equal(error.code, 'TRAFFIC_AUTHORIZATION_INVALID');
    return true;
  });
  assert.deepEqual((await fs.readdir(fixture.root)).sort(), before);
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
