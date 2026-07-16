import assert from 'node:assert/strict';
import test from 'node:test';
import { LoginRateLimiter } from '../../packages/server/modules/auth/loginRateLimiter';

test('allows five failures and blocks the sixth for one normalized login key', () => {
  let now = 0;
  const limiter = new LoginRateLimiter(() => now);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(limiter.check('127.0.0.1', ' Admin ').allowed, true);
    limiter.recordFailure('127.0.0.1', ' Admin ');
  }

  const result = limiter.check('127.0.0.1', 'admin');
  assert.equal(result.allowed, false);
  assert.ok(result.retryAfterSeconds > 0);
});

test('clearing failures after a successful login allows the next attempt', () => {
  const limiter = new LoginRateLimiter(() => 0);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    limiter.recordFailure('127.0.0.1', 'admin');
  }
  limiter.clear('127.0.0.1', ' ADMIN ');

  assert.equal(limiter.check('127.0.0.1', 'admin').allowed, true);
});

test('expires failures after fifteen minutes', () => {
  let now = 0;
  const limiter = new LoginRateLimiter(() => now);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    limiter.recordFailure('127.0.0.1', 'admin');
  }
  now += 15 * 60 * 1000;

  assert.equal(limiter.check('127.0.0.1', 'admin').allowed, true);
});

test('evicts the oldest unexpired subject when capacity is reached', () => {
  let now = 0;
  const limiter = new LoginRateLimiter(() => now, 2);

  for (const username of ['oldest', 'newer']) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      limiter.recordFailure('127.0.0.1', username);
    }
    now += 1;
  }
  limiter.recordFailure('127.0.0.1', 'third');

  assert.equal(limiter.check('127.0.0.1', 'oldest').allowed, true);
  assert.equal(limiter.check('127.0.0.1', 'newer').allowed, false);
});
