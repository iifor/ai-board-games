import assert from 'node:assert/strict';
import test from 'node:test';
import { createGracefulShutdownHandler } from '../../packages/server/lifecycle';

interface TestTimer {
  callback: () => void;
  cleared: boolean;
  unref(): void;
}

function createTestOptions(exits: number[], timers: TestTimer[]) {
  return {
    exit: (code: number) => exits.push(code),
    setTimer: (callback: () => void) => {
      const timer: TestTimer = { callback, cleared: false, unref() {} };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer: TestTimer) => { timer.cleared = true; },
  };
}

test('graceful shutdown closes once and exits zero', () => {
  const exits: number[] = [];
  const timers: TestTimer[] = [];
  let closes = 0;
  const server = {
    close(callback: (error?: Error) => void) {
      closes += 1;
      callback();
    },
  };
  const shutdown = createGracefulShutdownHandler(server, createTestOptions(exits, timers));

  shutdown('SIGTERM');
  shutdown('SIGINT');

  assert.equal(closes, 1);
  assert.deepEqual(exits, [0]);
  assert.equal(timers[0].cleared, true);
});

test('graceful shutdown exits non-zero on close error', () => {
  const exits: number[] = [];
  const timers: TestTimer[] = [];
  const server = { close: (callback: (error?: Error) => void) => callback(new Error('close failed')) };

  createGracefulShutdownHandler(server, createTestOptions(exits, timers))('SIGTERM');

  assert.deepEqual(exits, [1]);
  assert.equal(timers[0].cleared, true);
});

test('graceful shutdown timeout exits non-zero once', () => {
  const exits: number[] = [];
  const timers: TestTimer[] = [];
  let closeCallback: ((error?: Error) => void) | undefined;
  const server = { close: (callback: (error?: Error) => void) => { closeCallback = callback; } };
  const shutdown = createGracefulShutdownHandler(server, createTestOptions(exits, timers));

  shutdown('SIGTERM');
  timers[0].callback();
  closeCallback?.();

  assert.deepEqual(exits, [1]);
});
