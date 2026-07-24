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

function waitForShutdownStep(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test('graceful shutdown closes once and exits zero', async () => {
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
  await waitForShutdownStep();

  assert.equal(closes, 1);
  assert.deepEqual(exits, [0]);
  assert.equal(timers[0].cleared, true);
});

test('graceful shutdown exits non-zero on close error', async () => {
  const exits: number[] = [];
  const timers: TestTimer[] = [];
  const server = { close: (callback: (error?: Error) => void) => callback(new Error('close failed')) };

  createGracefulShutdownHandler(server, createTestOptions(exits, timers))('SIGTERM');
  await waitForShutdownStep();

  assert.deepEqual(exits, [1]);
  assert.equal(timers[0].cleared, true);
});

test('graceful shutdown timeout exits non-zero once', async () => {
  const exits: number[] = [];
  const timers: TestTimer[] = [];
  let closeCallback: ((error?: Error) => void) | undefined;
  const server = { close: (callback: (error?: Error) => void) => { closeCallback = callback; } };
  const shutdown = createGracefulShutdownHandler(server, createTestOptions(exits, timers));

  shutdown('SIGTERM');
  await waitForShutdownStep();
  timers[0].callback();
  closeCallback?.();

  assert.deepEqual(exits, [1]);
});

test('graceful shutdown cleans resources before closing HTTP', async () => {
  const exits: number[] = [];
  const timers: TestTimer[] = [];
  const order: string[] = [];
  const server = {
    close(callback: (error?: Error) => void) {
      order.push('http');
      callback();
    },
  };
  const shutdown = createGracefulShutdownHandler(server, {
    ...createTestOptions(exits, timers),
    cleanup: () => {
      order.push('cleanup');
    },
  });

  shutdown('SIGTERM');
  await waitForShutdownStep();

  assert.deepEqual(order, ['cleanup', 'http']);
  assert.deepEqual(exits, [0]);
});

test('graceful shutdown exits non-zero when cleanup fails', async () => {
  const exits: number[] = [];
  const timers: TestTimer[] = [];
  let closes = 0;
  const server = {
    close() {
      closes += 1;
    },
  };
  const shutdown = createGracefulShutdownHandler(server, {
    ...createTestOptions(exits, timers),
    cleanup: () => {
      throw new Error('cleanup failed');
    },
  });

  shutdown('SIGTERM');
  await waitForShutdownStep();

  assert.equal(closes, 0);
  assert.deepEqual(exits, [1]);
});
