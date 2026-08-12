import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import test from 'node:test';
import {
  createObservationFixture, persistObservationFixture, runObservation,
} from './deploymentGateFixtures';

test('observation binds traffic authorization and a post-observation isolated restore', async (t) => {
  const fixture = await createObservationFixture();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  const before = (await fs.readdir(fixture.root)).sort();
  const result = await runObservation(fixture);
  assert.deepEqual(result.exits, [0]);
  assert.equal(JSON.parse(result.stdout[0]).status, 'passed');
  assert.deepEqual((await fs.readdir(fixture.root)).sort(), before);
});

test('observation rejects chronology, duration, check, traffic, and restore gaps', async (t) => {
  const cases: Array<[string, (fixture: any) => void]> = [
    ['under 60 minutes', (fx) => { fx.observation.finishedAt = new Date(Date.parse(fx.observation.startedAt) + 3_599_999).toISOString(); }],
    ['traffic hash mismatch', (fx) => { fx.observation.trafficAuthorizationSha256 = 'f'.repeat(64); }],
    ['run mismatch', (fx) => { fx.observation.readinessRunId = 'different-run'; }],
    ['missing check', (fx) => { fx.observation.checks.pop(); }],
    ['restore failed', (fx) => { fx.restore.status = 'failed'; }],
    ['not isolated', (fx) => { fx.restore.isolatedTarget = false; }],
    ['old backup', (fx) => { fx.restore.backupCreatedAt = new Date(Date.parse(fx.observation.startedAt) - 1).toISOString(); }],
    ['restore before closure', (fx) => { fx.restore.finishedAt = new Date(Date.parse(fx.observation.finishedAt) - 1).toISOString(); }],
    ['future restore', (fx) => { fx.restore.finishedAt = new Date(Date.now() + 60_000).toISOString(); }],
    ['observation predates traffic', (fx) => { fx.observation.startedAt = new Date(Date.parse(fx.authorization.approvedAt) - 1).toISOString(); }],
  ];
  for (const [name, mutate] of cases) {
    const fixture = await createObservationFixture();
    t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
    mutate(fixture);
    await persistObservationFixture(fixture);
    await assert.rejects(() => runObservation(fixture), (error: any) => {
      assert.equal(error.code, 'OBSERVATION_RECEIPT_INVALID', name);
      return true;
    });
  }
});
