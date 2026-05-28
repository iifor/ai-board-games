import test from 'node:test';
import assert from 'node:assert/strict';
import { debugSpeech, isWerewolfDebugMode, runDebugHunterAction, runDebugWerewolfAction } from '../../packages/server/modules/werewolf/debugActions';

test('debug werewolf speech uses fixed faction text without player agent', () => {
  const runtime = createRuntime();
  const wolf = runtime.agents[1];
  const villager = runtime.agents[0];

  assert.equal(isWerewolfDebugMode({ state: { debugMode: true }, config: {} }), true);
  assert.equal(debugSpeech(wolf), '我是2号，狼人，调试发言');
  assert.equal(debugSpeech(villager), '我是1号，好人，调试发言');
  assert.deepEqual(runDebugWerewolfAction(runtime, createRound(), wolf, 'day_speech'), {
    text: '我是2号，狼人，调试发言',
    thinking: ''
  });
  assert.deepEqual(runDebugWerewolfAction(runtime, createRound(), wolf, 'wolf_speech'), {
    speech: '我是2号，狼人，调试发言',
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
    speech: '我是2号，狼人，调试发言',
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

