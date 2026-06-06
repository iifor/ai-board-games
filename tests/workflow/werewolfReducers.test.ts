import test from 'node:test';
import assert from 'node:assert/strict';
import { createRound } from '../../packages/server/modules/werewolf/agents';
import {
  applyActionResults,
  findPendingHunter,
  getActorsForStep,
  getTargetIds,
  getWitchActionEligibility,
} from '../../packages/server/modules/werewolf/reducers';
import { ensureWolfTeamContext, wolfLeaderPriority } from '../../packages/server/modules/werewolf/wolfTeam';
import { getActionPhaseConfig } from '../../packages/server/modules/werewolf/actionPhases';
import {
  applySheriffBadgeDisposition,
  findPendingSheriffBadgeDisposition,
} from '../../packages/server/modules/werewolf/sheriffWorkflow';
import { createWerewolfSteps } from '../../packages/server/modules/werewolf/steps';

interface TestAgent {
  id: number;
  faction: string;
  alive: boolean;
  canVote: boolean;
  votes: Array<Record<string, unknown>>;
  seerChecks: Array<Record<string, unknown>>;
  roleConfig: { name: string; rule: { actions: Array<{ action: string }> } };
  [key: string]: unknown;
}

function actor(id: number, faction: string, actions: string[] = [], patch: Record<string, unknown> = {}): TestAgent {
  return {
    id,
    faction,
    alive: true,
    canVote: true,
    votes: [],
    seerChecks: [],
    roleConfig: { name: String(id), rule: { actions: actions.map((action) => ({ action })) } },
    ...patch
  } as TestAgent;
}

function runtime() {
  const round = createRound(1);
  const agents = [
    actor(1, 'wolves', ['kill']),
    actor(2, 'good', ['inspectFaction']),
    actor(3, 'good', ['guard']),
    actor(4, 'good', ['save', 'poison']),
    actor(5, 'good')
  ];
  return {
    agents,
    modeConfig: { witch: {}, sheriff: {} },
    state: { rounds: [round] }
  };
}

test('reducers aggregate wolf kill choices and target ids', () => {
  const ctx = runtime();
  const step = { config: { day: 1, actionType: 'wolf_kill' } };

  applyActionResults(ctx as never, step as never, [{ actorId: 1, payload: { target: 5, speech: 'push 5' } }]);

  const round = ctx.state.rounds[0];
  assert.equal(round.night.wolfTarget, 5);
  assert.deepEqual(round.night.wolfChoices, { 1: 5 });
  assert.equal(round.night.wolfSpeeches[0].text, 'push 5');
  assert.deepEqual(getTargetIds(ctx as never, step as never), [2, 3, 4, 5]);
});

test('reducers apply role action payloads to round and actors', () => {
  const ctx = runtime();
  applyActionResults(ctx as never, { config: { day: 1, actionType: 'seer_check' } } as never, [{ actorId: 2, payload: { target: 1, result: 'wolf' } }]);
  applyActionResults(ctx as never, { config: { day: 1, actionType: 'guard_protect' } } as never, [{ actorId: 3, payload: { target: 2 } }]);
  ctx.state.rounds[0].night.wolfTarget = 2;
  applyActionResults(ctx as never, { config: { day: 1, actionType: 'witch_save' } } as never, [{ actorId: 4, payload: { use: true } }]);
  applyActionResults(ctx as never, { config: { day: 1, actionType: 'witch_poison' } } as never, [{ actorId: 4, payload: { use: true, target: 5 } }]);

  const round = ctx.state.rounds[0];
  assert.deepEqual(round.night.seerCheck, { target: 1, result: 'wolf' });
  assert.equal(ctx.agents[1].seerChecks.length, 1);
  assert.equal(round.night.guardTarget, 2);
  assert.equal(ctx.agents[2].lastGuardTarget, 2);
  assert.equal(round.night.witchSaveTarget, 2);
  assert.equal(ctx.agents[3].usedAntidote, true);
  assert.equal(round.night.witchPoisonTarget, 5);
  assert.equal(ctx.agents[3].usedPoison, true);
});

test('witch poison requires strict true and uses reason-aware narration', () => {
  const ctx = runtime();
  applyActionResults(
    ctx as never,
    { config: { day: 1, actionType: 'witch_poison' } } as never,
    [{ actorId: 4, payload: { use: 'false', target: 5 } }],
  );
  assert.equal(ctx.state.rounds[0].night.witchPoisonTarget, null);

  const phase = getActionPhaseConfig('witch_poison');
  assert.equal(phase?.buildMessages(1, { witchPoisonUsed: true, target: 5, witchPoisonReason: '判断5号是狼人' }).result, '判断5号是狼人');
  assert.equal(phase?.buildMessages(1, { witchPoisonUsed: true, target: 5 }).result, '女巫毒了5号');
  assert.equal(phase?.buildMessages(1, { witchPoisonUsed: false }).result, '女巫没有使用毒药');
});

test('sheriff badge disposition transfers, tears, and does not repeat', () => {
  const round = createRound(2);
  round.phase = 'day';
  round.sheriffId = 2;
  round.sheriffBadge = { status: 'held' };
  const agents = [
    actor(1, 'good'),
    actor(2, 'good', [], { alive: false, sheriffId: 2 }),
    actor(3, 'good'),
  ];
  const ctx = { agents, state: { rounds: [round] }, modeConfig: { sheriff: {} } };

  const sheriff = findPendingSheriffBadgeDisposition(ctx as never, round as never);
  assert.equal(sheriff?.id, 2);
  const transfer = applySheriffBadgeDisposition(ctx as never, round as never, sheriff as never, {
    action: 'transfer',
    target: 3,
    reason: '信任3号',
  });
  assert.equal(transfer.action, 'transfer');
  assert.equal(round.sheriffId, 3);
  assert.equal(findPendingSheriffBadgeDisposition(ctx as never, round as never), null);

  agents[2].alive = false;
  const nextRound = createRound(3);
  nextRound.phase = 'night';
  ctx.state.rounds.push(nextRound);
  const nextSheriff = findPendingSheriffBadgeDisposition(ctx as never, nextRound as never);
  assert.equal(nextSheriff?.id, 3);
  const tear = applySheriffBadgeDisposition(ctx as never, nextRound as never, nextSheriff as never, {
    action: 'transfer',
    target: 99,
  });
  assert.equal(tear.action, 'tear');
  assert.equal(nextRound.sheriffId, null);
  assert.equal(nextRound.sheriffBadge.status, 'torn');
});

test('sheriff chooses speech direction and always speaks last', () => {
  const round = createRound(1);
  round.phase = 'day';
  round.sheriffId = 2;
  round.sheriffBadge = { status: 'held' };
  const ctx = {
    agents: [actor(1, 'good'), actor(2, 'good'), actor(3, 'good'), actor(4, 'good')],
    modeConfig: { sheriff: {} },
    state: { rounds: [round] },
  };

  applyActionResults(ctx as never, { config: { day: 1, actionType: 'sheriff_speech_direction' } } as never, [
    { actorId: 2, payload: { direction: 'counterclockwise', reason: '先听后置位' } },
  ]);
  const order = getActorsForStep(ctx as never, { config: { day: 1, actionType: 'day_speech' } } as never, round as never);

  assert.deepEqual(order.map((item: TestAgent) => item.id), [1, 4, 3, 2]);
  assert.equal(round.daySpeech?.startPlayerId, 1);
  assert.equal(round.daySpeech?.direction, 'counterclockwise');
});

test('inherited sheriff decides direction on later day', () => {
  const day1 = createRound(1);
  day1.sheriffId = 3;
  day1.sheriffBadge = { status: 'held' };
  const day2 = createRound(2);
  day2.phase = 'day';
  const ctx = {
    agents: [actor(1, 'good'), actor(2, 'good'), actor(3, 'good'), actor(4, 'good')],
    modeConfig: { sheriff: {} },
    state: { rounds: [day1, day2] },
  };

  const directionActors = getActorsForStep(ctx as never, { config: { day: 2, actionType: 'sheriff_speech_direction' } } as never, day2 as never);
  assert.deepEqual(directionActors.map((item: TestAgent) => item.id), [3]);
});

test('speech starts clockwise after the last announced death when there is no sheriff', () => {
  const round = createRound(1);
  round.phase = 'day';
  round.night.deaths = [
    { id: 2, reason: '狼人袭击' },
    { id: 4, reason: '女巫毒杀' },
  ];
  const ctx = {
    agents: [
      actor(1, 'good'),
      actor(2, 'good', [], { alive: false }),
      actor(3, 'good'),
      actor(4, 'good', [], { alive: false }),
      actor(5, 'good'),
    ],
    modeConfig: { sheriff: {} },
    state: { rounds: [round] },
  };

  const order = getActorsForStep(ctx as never, { config: { day: 1, actionType: 'day_speech' } } as never, round as never);
  assert.deepEqual(order.map((item: TestAgent) => item.id), [5, 1, 3]);
  assert.equal(round.daySpeech?.deathId, 4);
  assert.equal(round.daySpeech?.source, 'night-death');
});

test('invalid sheriff direction falls back once and is persisted', () => {
  const originalRandom = Math.random;
  Math.random = () => 0.9;
  try {
    const round = createRound(1);
    round.phase = 'day';
    round.sheriffId = 2;
    round.sheriffBadge = { status: 'held' };
    const ctx = {
      agents: [actor(1, 'good'), actor(2, 'good'), actor(3, 'good')],
      modeConfig: { sheriff: {} },
      state: { rounds: [round] },
    };
    applyActionResults(ctx as never, { config: { day: 1, actionType: 'sheriff_speech_direction' } } as never, [
      { actorId: 2, payload: { direction: 'invalid' } },
    ]);
    Math.random = () => 0.1;
    const first = getActorsForStep(ctx as never, { config: { day: 1, actionType: 'day_speech' } } as never, round as never);
    const second = getActorsForStep(ctx as never, { config: { day: 1, actionType: 'day_speech' } } as never, round as never);
    assert.equal(round.daySpeech?.direction, 'counterclockwise');
    assert.deepEqual(second.map((item: TestAgent) => item.id), first.map((item: TestAgent) => item.id));
  } finally {
    Math.random = originalRandom;
  }
});

test('workflow places sheriff direction immediately before day speech every day', () => {
  const steps = createWerewolfSteps();
  for (const day of [1, 2]) {
    const directionIndex = steps.findIndex((step) => step.id === `sheriff_speech_direction_${day}`);
    const speechIndex = steps.findIndex((step) => step.id === `day_speech_${day}`);
    assert.equal(directionIndex + 1, speechIndex);
  }
});

test('reducers select actors and pending hunter', () => {
  const ctx = runtime();
  const round = ctx.state.rounds[0];
  round.night.wolfTarget = 5;
  assert.deepEqual(getActorsForStep(ctx as never, { config: { actionType: 'wolf_kill' } } as never, round as never).map((item: TestAgent) => item.id), [1]);
  assert.deepEqual(getActorsForStep(ctx as never, { config: { actionType: 'witch_save' } } as never, round as never).map((item: TestAgent) => item.id), [4]);

  const hunter = actor(6, 'good', ['shootOnDeath'], { alive: false, hunterShotUsed: false });
  assert.equal(findPendingHunter([hunter] as never, round as never, [{ id: 6 }] as never)?.id, 6);
});

test('witch night eligibility keeps antidote knowledge separate from poison access', () => {
  const ctx = runtime();
  const round = ctx.state.rounds[0];
  const witch = ctx.agents[3];
  round.night.wolfTarget = 5;

  assert.equal(getWitchActionEligibility(ctx as never, round as never, 'witch_save').actor?.id, 4);
  assert.equal(getWitchActionEligibility(ctx as never, round as never, 'witch_poison').actor?.id, 4);

  witch.usedAntidote = true;
  assert.equal(getWitchActionEligibility(ctx as never, round as never, 'witch_save').skipReason, 'antidote_depleted');
  assert.equal(getWitchActionEligibility(ctx as never, round as never, 'witch_poison').actor?.id, 4);

  witch.usedPoison = true;
  assert.equal(getWitchActionEligibility(ctx as never, round as never, 'witch_poison').skipReason, 'poison_depleted');

  witch.usedAntidote = false;
  round.night.wolfTarget = null;
  assert.equal(getWitchActionEligibility(ctx as never, round as never, 'witch_save').skipReason, 'no_wolf_target');
  assert.equal(getWitchActionEligibility(ctx as never, round as never, 'witch_poison').skipReason, 'poison_depleted');

  witch.alive = false;
  assert.equal(getWitchActionEligibility(ctx as never, round as never, 'witch_save').skipReason, 'witch_unavailable');
  assert.equal(getWitchActionEligibility(ctx as never, round as never, 'witch_poison').skipReason, 'witch_unavailable');
});

test('witch poison respects one potion per night after antidote use', () => {
  const ctx = runtime();
  const round = ctx.state.rounds[0];
  ctx.modeConfig.witch = { onePotionPerNight: true };
  round.night.witchSave = true;

  assert.equal(
    getWitchActionEligibility(ctx as never, round as never, 'witch_poison').skipReason,
    'one_potion_per_night',
  );
});

test('reducers select night actors with workflow action aliases', () => {
  const round = createRound(1);
  round.night.wolfTarget = 5;
  const ctx = {
    agents: [
      actor(1, 'wolves', ['kill']),
      actor(2, 'good', ['seer_check']),
      actor(3, 'good', ['guard_protect']),
      actor(4, 'good', ['witch_save', 'witch_poison'])
    ],
    modeConfig: { witch: {}, sheriff: {} },
    state: { rounds: [round] }
  };

  assert.deepEqual(getActorsForStep(ctx as never, { config: { actionType: 'seer_check' } } as never, round as never).map((item: TestAgent) => item.id), [2]);
  assert.deepEqual(getActorsForStep(ctx as never, { config: { actionType: 'guard_protect' } } as never, round as never).map((item: TestAgent) => item.id), [3]);
  assert.deepEqual(getActorsForStep(ctx as never, { config: { actionType: 'witch_save' } } as never, round as never).map((item: TestAgent) => item.id), [4]);
  assert.deepEqual(getActorsForStep(ctx as never, { config: { actionType: 'witch_poison' } } as never, round as never).map((item: TestAgent) => item.id), [4]);
});

test('wolf team context shares wolves and prefers high identity leader', () => {
  const ctx = runtime();
  ctx.agents = [
    actor(1, 'wolves', ['kill']),
    actor(2, 'wolves', ['kill'], { role: 'white_wolf_king', roleLabel: '白狼王', roleConfig: { id: 'white_wolf_king', name: '白狼王', rule: { actions: [{ action: 'kill' }], wolfLeaderPriority: 100 } } }),
    actor(3, 'wolves', ['kill']),
    actor(4, 'good')
  ];

  const context = ensureWolfTeamContext(ctx as never, ctx.state.rounds[0] as never);

  assert.deepEqual(context.wolfIds, [1, 2, 3]);
  assert.equal(context.wolfLeaderId, 2);
  assert.deepEqual(context.wolfSpeechOrder, [2, 3, 1]);
  assert.match(context.wolfSharedInfo, /狼队成员/);
  assert.equal(wolfLeaderPriority(ctx.agents[1] as never), 100);
});
