import test from 'node:test';
import assert from 'node:assert/strict';
import { createConcurrencyLimiter } from '../../packages/server/utils/concurrencyLimiter';
import { createGameCapacity } from '../../packages/server/modules/game-socket/capacity';

test('concurrency limiter caps active work and preserves FIFO order', async () => {
  const limiter = createConcurrencyLimiter(2);
  let active = 0;
  let peak = 0;
  const started: number[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tasks = [1, 2, 3, 4].map((id) => limiter.run(async () => {
    started.push(id);
    active += 1;
    peak = Math.max(peak, active);
    await gate;
    active -= 1;
  }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, [1, 2]);
  assert.deepEqual(limiter.stats(), { limit: 2, active: 2, queued: 2 });
  release();
  await Promise.all(tasks);
  assert.equal(peak, 2);
  assert.deepEqual(started, [1, 2, 3, 4]);
});

test('concurrency limiter releases capacity after rejection', async () => {
  const limiter = createConcurrencyLimiter(1);
  await assert.rejects(limiter.run(async () => { throw new Error('boom'); }), /boom/);
  assert.equal(await limiter.run(async () => 'ok'), 'ok');
  assert.equal(limiter.stats().active, 0);
});

test('game capacity accepts five leases and rejects the sixth', () => {
  const capacity = createGameCapacity(5);
  const leases = Array.from({ length: 5 }, () => capacity.tryAcquire());
  assert.ok(leases.every(Boolean));
  assert.equal(capacity.tryAcquire(), null);
  leases[0]!();
  assert.ok(capacity.tryAcquire());
});
