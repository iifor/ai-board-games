import test from 'node:test';
import assert from 'node:assert/strict';
import { debugSpeech, isWerewolfDebugMode, runDebugHunterAction, runDebugWerewolfAction, runDebugSelfDestructAction } from '../../packages/server/modules/werewolf/debugActions';

test('debug werewolf speech uses fixed faction text without player agent', () => {
  const runtime = createRuntime();
  const wolf = runtime.agents[1];
  const villager = runtime.agents[0];

  assert.equal(isWerewolfDebugMode({ state: { debugMode: true }, config: {} }), true);
  assert.equal(debugSpeech(wolf), '2号发言');
  assert.equal(debugSpeech(villager), '1号发言');
  assert.deepEqual(runDebugWerewolfAction(runtime, createRound(), wolf, 'day_speech'), {
    text: '2号发言',
    thinking: ''
  });
  assert.deepEqual(runDebugWerewolfAction(runtime, createRound(), wolf, 'wolf_speech'), {
    speech: '2号发言',
    thinking: ''
  });
});

test('debug werewolf actions choose deterministic legal payloads', () => {
  const runtime = createRuntime();
  const round = createRound();
  const wolf = runtime.agents[1];
  const villager = runtime.agents[0];

  assert.deepEqual(runDebugWerewolfAction(runtime, round, wolf, 'wolf_vote'), { target: 1 });
  assert.deepEqual(runDebugWerewolfAction(runtime, round, wolf, 'wolf_kill'), {
    target: 1,
    speech: '2号发言',
    thinking: ''
  });
  assert.deepEqual(runDebugWerewolfAction(runtime, round, villager, 'seer_check'), { target: 2, result: '狼人' });
  assert.deepEqual(runDebugWerewolfAction(runtime, round, villager, 'witch_save'), { use: false });
  assert.deepEqual(runDebugWerewolfAction(runtime, round, villager, 'witch_poison'), { use: false, target: null });
  assert.deepEqual(runDebugWerewolfAction(runtime, round, villager, 'sheriff_signup'), { run: false });
  assert.deepEqual(runDebugWerewolfAction(runtime, round, villager, 'day_vote'), { target: 2 });
});

test('debug hunter shot does not call skills and picks first alive target', () => {
  const runtime = createRuntime();
  assert.deepEqual(runDebugHunterAction(runtime, runtime.agents[2]), { target: 1 });
});

test('debug guard protect includes reason and respects lastGuardTarget', () => {
  const runtime = createRuntime();
  const round = createRound();
  const guard = runtime.agents[0]; // id=1, good faction

  // 首次守护：无 lastGuardTarget 限制，应返回 reason
  const result1 = runDebugWerewolfAction(runtime, round, guard, 'guard_protect') as Record<string, unknown>;
  assert.ok(result1.target === 2 || result1.target === 3, 'guard should pick a non-self target');
  assert.ok(typeof result1.reason === 'string', 'guard result should include reason');
  assert.ok(String(result1.reason).startsWith('debug-守'), 'reason should start with debug-守');

  // 空守测试：所有其他玩家都是 lastGuardTarget 时回退
  const guardWithHistory = { ...guard, lastGuardTarget: 2 };
  const result2 = runDebugWerewolfAction(runtime, round, guardWithHistory, 'guard_protect') as Record<string, unknown>;
  assert.ok(typeof result2.reason === 'string', 'guard result with history should include reason');
});

test('debug white wolf king day_speech can trigger self-destruct', () => {
  const runtime = {
    agents: [
      { id: 1, alive: true, faction: 'good' },
      { id: 2, alive: true, faction: 'wolves', role: 'white_wolf_king' },
      { id: 3, alive: true, faction: 'good' }
    ]
  };
  const round = createRound();
  const whiteWolfKing = runtime.agents[1];

  // 多次运行验证自爆逻辑存在（概率触发）
  let selfDestructTriggered = false;
  for (let i = 0; i < 50; i++) {
    const result = runDebugWerewolfAction(runtime, round, whiteWolfKing, 'day_speech') as Record<string, unknown>;
    assert.ok(typeof result.text === 'string', 'day_speech should always have text');
    if (result.selfDestruct === true) {
      selfDestructTriggered = true;
      assert.ok(result.target === 1 || result.target === 3, 'self-destruct target should be a non-wolf alive player');
      assert.ok(typeof result.selfDestructText === 'string', 'self-destruct should have text');
      break;
    }
  }
  assert.ok(selfDestructTriggered, 'white wolf king self-destruct should trigger at least once in 50 attempts');
});

test('debug self-destruct action returns valid payload', () => {
  const runtime = {
    agents: [
      { id: 1, alive: true, faction: 'good' },
      { id: 2, alive: true, faction: 'wolves', role: 'white_wolf_king' },
      { id: 3, alive: true, faction: 'good' }
    ]
  };
  const whiteWolfKing = runtime.agents[1];

  // 多次运行验证独立自爆函数
  let usedOnce = false;
  let notUsedOnce = false;
  for (let i = 0; i < 50; i++) {
    const result = runDebugSelfDestructAction(runtime, whiteWolfKing) as Record<string, unknown>;
    if (result.use === true) {
      usedOnce = true;
      assert.ok(result.target === 1 || result.target === 3, 'self-destruct target should be non-wolf');
      assert.ok(typeof result.text === 'string' && String(result.text).length > 0, 'self-destruct text should be non-empty');
    } else {
      notUsedOnce = true;
      assert.equal(result.target, null, 'no self-destruct means no target');
    }
  }
  assert.ok(usedOnce, 'self-destruct should trigger at least once in 50 attempts');
  assert.ok(notUsedOnce, 'self-destruct should not trigger at least once in 50 attempts');
});

test('debug self-destruct rejects non-wolf actors', () => {
  const runtime = {
    agents: [
      { id: 1, alive: true, faction: 'good' },
      { id: 2, alive: true, faction: 'wolves', role: 'white_wolf_king' }
    ]
  };
  const villager = runtime.agents[0];
  const result = runDebugSelfDestructAction(runtime, villager);
  assert.deepEqual(result, { use: false, text: '', target: null });
});

test('debug self-destruct rejects dead actors', () => {
  const runtime = {
    agents: [
      { id: 1, alive: true, faction: 'good' },
      { id: 2, alive: false, faction: 'wolves', role: 'white_wolf_king' }
    ]
  };
  const deadWolf = runtime.agents[1];
  const result = runDebugSelfDestructAction(runtime, deadWolf);
  assert.deepEqual(result, { use: false, text: '', target: null });
});

function createRuntime() {
  return {
    agents: [
      { id: 1, alive: true, faction: 'good' },
      { id: 2, alive: true, faction: 'wolves' },
      { id: 3, alive: true, faction: 'good' }
    ]
  };
}

function createRound() {
  return {
    day: 1,
    night: {},
    sheriffElection: { candidates: [2, 3], runoffCandidateIds: [3] }
  };
}

