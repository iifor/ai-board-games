import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createFreezeFixture, GO_LIVE_OWNER, persistFreezeFixture, RESOURCE_PATHS, runFreeze,
} from './deploymentGateFixtures';

test('validates stable freeze evidence without writing files', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'freeze-gate-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const fixture = await createFreezeFixture(root, Date.now());
  const before = (await fs.readdir(root)).sort();
  const result = await runFreeze(fixture);
  assert.deepEqual(result.exits, [0]);
  assert.equal(JSON.parse(result.stdout[0]).status, 'passed');
  assert.deepEqual((await fs.readdir(root)).sort(), before);
});

test('freeze evidence rejects expired authorization, binding drift, check gaps, and placeholder identities', async (t) => {
  const cases: Array<[string, (fixture: any) => void, Record<string, string>?]> = [
    ['not approved', (fx) => { fx.maintenance.status = 'pending'; }],
    ['expired', (fx) => { fx.maintenance.expiresAt = new Date(Date.now() - 1).toISOString(); }],
    ['freeze not yet effective', (fx) => {
      const future = Date.now() + 60_000;
      fx.freeze.frozenAt = new Date(future).toISOString();
      fx.freeze.platformApprover.approvedAt = new Date(future + 1_000).toISOString();
      fx.maintenance.expiresAt = new Date(future + 3_600_000).toISOString();
    }],
    ['platform approval is in the future', (fx) => {
      fx.freeze.platformApprover.approvedAt = new Date(Date.now() + 60_000).toISOString();
    }],
    ['candidate mismatch', () => undefined, { releaseCandidate: 'c'.repeat(40) }],
    ['tooling mismatch', () => undefined, { toolingHead: 'd'.repeat(40) }],
    ['freeze mismatch', () => undefined, { freezeId: 'different-freeze' }],
    ['source mismatch', () => undefined, { sourceSqlite: 'different.sqlite' }],
    ['resource order mismatch', () => undefined, { resources: [...RESOURCE_PATHS].reverse().join(',') }],
    ['receipt hash mismatch', () => undefined, { receiptSha256: 'f'.repeat(64) }],
    ['writer active', (fx) => { fx.freeze.checks[0].status = 'failed'; }],
    ['background check missing', (fx) => { fx.freeze.checks.pop(); }],
    ['placeholder approver', (fx) => { fx.freeze.platformApprover.name = 'REPLACE_WITH_APPROVER'; }],
    ['approver is go-live owner', (fx) => { fx.freeze.platformApprover.name = GO_LIVE_OWNER; }],
    ['freeze before approval', (fx) => { fx.freeze.frozenAt = new Date(Date.parse(fx.maintenance.approvedAt) - 1).toISOString(); }],
  ];
  for (const [name, mutate, expected] of cases) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'freeze-gate-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const fixture = await createFreezeFixture(root, Date.now());
    mutate(fixture);
    await persistFreezeFixture(fixture);
    await assert.rejects(() => runFreeze(fixture, expected), (error: any) => {
      assert.equal(error.code, 'FREEZE_RECEIPT_INVALID', name);
      return true;
    });
  }
});

test('freeze errors are fixed and do not disclose hostile bytes', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'freeze-gate-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const fixture = await createFreezeFixture(root, Date.now());
  const secret = ['postgresql://user', 'password@private/consensus|PRIVATE_KEY_BYTES'].join(':');
  await fs.writeFile(fixture.freezePath, `{${JSON.stringify(secret)}`);
  await assert.rejects(() => runFreeze(fixture), (error: any) => {
    assert.equal(error.code, 'FREEZE_RECEIPT_INVALID');
    assert.equal(`${error.message}${JSON.stringify(error)}`.includes(secret), false);
    return true;
  });
});
