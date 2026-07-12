import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameCapacity, createSessionStartGuard } from '../../packages/server/modules/game-socket/capacity';

test('session start guard rejects duplicate starts and releases after completion', async () => {
  const guard = createSessionStartGuard(createGameCapacity(1));
  const session = {};
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const running = guard.run(session, false, () => gate);
  await assert.rejects(guard.run(session, false, async () => undefined), /当前连接已有游戏正在运行/);
  release();
  await running;
  await guard.run(session, false, async () => undefined);
});

test('session start guard rejects live games above global capacity but excludes replays', async () => {
  const guard = createSessionStartGuard(createGameCapacity(1));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const first = guard.run({}, false, () => gate);
  await assert.rejects(guard.run({}, false, async () => undefined), /服务器繁忙，请稍后重试/);
  await guard.run({}, true, async () => undefined);
  release();
  await first;
});
