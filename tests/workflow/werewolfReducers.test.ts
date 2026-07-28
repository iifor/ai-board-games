import test from 'node:test';
import assert from 'node:assert/strict';
import { createRound } from '../../packages/server/modules/werewolf/agents';
import {
  applyActionResults,
  applySelfDestruct,
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
import { applyHunterShot, resolveNightEffects } from '../../packages/server/modules/werewolf/effects';
import { DEFAULT_WEREWOLF_MODES } from '../../packages/server/modules/werewolf-config/constants';

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

test('postgame actions do not create rounds without a day', () => {
  const ctx = runtime();

  applyActionResults(ctx as never, { config: { actionType: 'mvp_vote' } } as never, [{ actorId: 1, payload: { target: 2 } }]);
  applyActionResults(ctx as never, { config: { actionType: 'postgame_speech' } } as never, [{ actorId: 1, payload: { speak: true, text: '复盘发言' } }]);

  assert.equal(ctx.state.rounds.length, 1);
  assert.equal((ctx.state as Record<string, unknown>).mvpVotes && ((ctx.state as Record<string, unknown>).mvpVotes as Record<string, number>)['1'], 2);
  assert.equal((((ctx.state as Record<string, unknown>).postgameSpeeches as Record<string, { text: string }>)['1']).text, '复盘发言');
});

test('round-bound actions reject a missing day instead of corrupting round history', () => {
  const ctx = runtime();

  assert.throws(
    () => applyActionResults(ctx as never, { config: { actionType: 'wolf_vote' } } as never, []),
    /valid day/,
  );
  assert.equal(ctx.state.rounds.length, 1);
});

test('reducers apply role action payloads to round and actors', () => {
  const ctx = runtime();
  applyActionResults(ctx as never, { config: { day: 1, actionType: 'seer_check' } } as never, [{ actorId: 2, payload: { target: 1, result: 'wolf', reason: '确认前置位' } }]);
  applyActionResults(ctx as never, { config: { day: 1, actionType: 'guard_protect' } } as never, [{ actorId: 3, payload: { target: 2, reason: '保护预言家' } }]);
  ctx.state.rounds[0].night.wolfTarget = 2;
  applyActionResults(ctx as never, { config: { day: 1, actionType: 'witch_save' } } as never, [{ actorId: 4, payload: { use: true, reason: '保住关键神职' } }]);
  applyActionResults(ctx as never, { config: { day: 1, actionType: 'witch_poison' } } as never, [{ actorId: 4, payload: { use: true, target: 5 } }]);

  const round = ctx.state.rounds[0];
  assert.deepEqual(round.night.seerCheck, { target: 1, result: 'wolf', reason: '确认前置位' });
  assert.equal(ctx.agents[1].seerChecks.length, 1);
  assert.equal(round.night.guardTarget, 2);
  assert.equal(round.night.guardReason, '保护预言家');
  assert.equal(ctx.agents[2].lastGuardTarget, 2);
  assert.equal(round.night.witchSaveTarget, 2);
  assert.equal(round.night.witchSaveReason, '保住关键神职');
  assert.equal(ctx.agents[3].usedAntidote, true);
  assert.equal(round.night.witchPoisonTarget, null);
  assert.equal(Boolean(ctx.agents[3].usedPoison), false);
});

test('reducers record dreamer target and repeated target state', () => {
  const round = createRound(2);
  const dreamer = actor(1, 'good', ['dream'], { role: 'dreamer', lastDreamTarget: 3 });
  const ctx = {
    agents: [dreamer, actor(2, 'wolves', ['kill']), actor(3, 'good')],
    modeConfig: {},
    state: { rounds: [round] },
  };

  applyActionResults(ctx as never, { config: { day: 2, actionType: 'dreamer_dream' } } as never, [
    { actorId: 1, payload: { target: 3, reason: 'repeat target' } },
  ]);

  assert.equal(round.night.dreamerTarget, 3);
  assert.equal(round.night.dreamerRepeatedTarget, true);
  assert.equal(round.night.dreamerReason, 'repeat target');
  assert.equal(dreamer.lastDreamTarget, 3);
});

test('reducers record spirit wolf learned skill branches', () => {
  const round = createRound(1);
  const spiritWolf = actor(1, 'wolves', ['kill', 'spiritWolfLearn'], { role: 'spirit_wolf' });
  const seer = actor(2, 'good', ['inspectFaction'], { role: 'seer' });
  const villager = actor(3, 'good', [], { role: 'villager' });
  const witch = actor(4, 'good', ['poison'], { role: 'witch' });
  const ctx = {
    agents: [spiritWolf, seer, villager, witch],
    modeConfig: {},
    state: { rounds: [round] },
  };

  applyActionResults(ctx as never, { config: { day: 1, actionType: 'spirit_wolf_learn' } } as never, [
    { actorId: 1, payload: { target: 2, reason: 'learn seer' } },
  ]);

  assert.equal(spiritWolf.spiritWolfLearnedRole, 'seer');
  assert.deepEqual(round.night.spiritWolfLearn, { actorId: 1, targetId: 2, learnedRole: 'seer', reason: 'learn seer' });

  const day2 = createRound(2);
  ctx.state.rounds.push(day2);
  applyActionResults(ctx as never, { config: { day: 2, actionType: 'spirit_wolf_inspect' } } as never, [
    { actorId: 1, payload: { target: 3, reason: 'check villager' } },
  ]);
  assert.deepEqual(day2.night.spiritWolfInspect, { target: 3, result: '平民', reason: 'check villager' });

  spiritWolf.spiritWolfLearnedRole = 'guard';
  applyActionResults(ctx as never, { config: { day: 2, actionType: 'spirit_wolf_guard' } } as never, [
    { actorId: 1, payload: { target: 4, reason: 'guard poison target' } },
  ]);
  assert.equal(day2.night.spiritWolfGuardTarget, 4);
  assert.equal(spiritWolf.lastSpiritWolfGuardTarget, 4);

  spiritWolf.spiritWolfLearnedRole = 'witch';
  day2.night.witchPoisonTarget = 3;
  applyActionResults(ctx as never, { config: { day: 2, actionType: 'spirit_wolf_antidote' } } as never, [
    { actorId: 1, payload: { use: true, target: 3, reason: 'save poison target' } },
  ]);
  assert.equal(day2.night.spiritWolfAntidoteTarget, 3);
  assert.equal(spiritWolf.spiritWolfAntidoteUsed, true);
});

test('reducers record wolf witch curse and illusionist illusion with cooldown', () => {
  const day1 = createRound(1);
  const day2 = createRound(2);
  const day3 = createRound(3);
  const wolfWitch = actor(1, 'wolves', ['kill', 'wolfWitchCurse'], { role: 'wolf_witch' });
  const illusionist = actor(2, 'good', ['illusion'], { role: 'illusionist' });
  const seer = actor(3, 'good', ['inspectFaction'], { role: 'seer', roleConfig: { name: 'seer', rule: { actions: [{ action: 'inspectFaction' }] }, roleType: 'god' } });
  const villager = actor(4, 'good', [], { role: 'villager' });
  const ctx = {
    agents: [wolfWitch, illusionist, seer, villager],
    modeConfig: { sheriff: {}, winCondition: 'side' },
    state: { rounds: [day1, day2, day3] },
  };

  applyActionResults(ctx as never, { config: { day: 1, actionType: 'wolf_witch_curse' } } as never, [
    { actorId: 1, payload: { target: 3, reason: 'block seer' } },
  ]);
  applyActionResults(ctx as never, { config: { day: 1, actionType: 'illusionist_illusion' } } as never, [
    { actorId: 2, payload: { target: 4, reason: 'hide behind villager' } },
  ]);

  assert.deepEqual(day1.night.wolfWitchCurse, { actorId: 1, targetId: 3, reason: 'block seer' });
  assert.equal(wolfWitch.wolfWitchLastCurseDay, 1);
  assert.equal(seer.skillDisabledUntilDay, 2);
  assert.equal(day1.night.illusionTarget, 4);
  assert.equal(day1.night.illusionReason, 'hide behind villager');
  assert.equal(illusionist.lastIllusionDay, 1);
  assert.deepEqual(getActorsForStep(ctx as never, { config: { day: 2, actionType: 'wolf_witch_curse' } } as never, day2 as never), []);
  assert.deepEqual(getActorsForStep(ctx as never, { config: { day: 2, actionType: 'illusionist_illusion' } } as never, day2 as never), []);
  assert.deepEqual(getActorsForStep(ctx as never, { config: { day: 1, actionType: 'seer_check' } } as never, day1 as never), []);
  assert.deepEqual(getActorsForStep(ctx as never, { config: { day: 3, actionType: 'seer_check' } } as never, day3 as never).map((item: TestAgent) => item.id), [3]);
});

test('reducers record magician swap and reject already swapped numbers', () => {
  const round = createRound(2);
  const magician = actor(1, 'good', ['swap'], { role: 'magician', magicianSwappedIds: [3] });
  const ctx = {
    agents: [magician, actor(2, 'wolves', ['kill']), actor(3, 'good'), actor(4, 'good')],
    modeConfig: {},
    state: { rounds: [round] },
  };

  applyActionResults(ctx as never, { config: { day: 2, actionType: 'magician_swap' } } as never, [
    { actorId: 1, payload: { target: 3, secondTarget: 4, reason: 'invalid repeat' } },
  ]);
  assert.equal(round.night.magicianSwap, undefined);

  applyActionResults(ctx as never, { config: { day: 2, actionType: 'magician_swap' } } as never, [
    { actorId: 1, payload: { target: 2, secondTarget: 4, reason: 'protect 4' } },
  ]);

  assert.deepEqual(round.night.magicianSwap, { firstTarget: 2, secondTarget: 4, reason: 'protect 4' });
  assert.deepEqual(magician.magicianSwappedIds, [3, 2, 4]);
});

test('dead players cannot contribute wolf or day votes', () => {
  const ctx = runtime();
  ctx.agents[0].faction = 'wolves';
  ctx.agents[0].roleConfig = { rule: { actions: [{ action: 'kill' }] } };
  ctx.agents[1].faction = 'wolves';
  ctx.agents[1].roleConfig = { rule: { actions: [{ action: 'kill' }] } };
  ctx.agents[1].alive = false;

  applyActionResults(ctx as never, { config: { day: 1, actionType: 'wolf_vote' } } as never, [
    { actorId: ctx.agents[0].id, payload: { target: 5 } },
    { actorId: ctx.agents[1].id, payload: { target: 4 } },
  ]);

  assert.deepEqual(ctx.state.rounds[0].night.wolfChoices, { [ctx.agents[0].id]: 5 });
  assert.deepEqual(ctx.state.rounds[0].night.wolfVoteTally, { 5: 1 });

  applyActionResults(ctx as never, { config: { day: 1, actionType: 'day_vote' } } as never, [
    { actorId: ctx.agents[0].id, payload: { target: 5 } },
    { actorId: ctx.agents[1].id, payload: { target: 4 } },
  ]);

  assert.deepEqual(ctx.state.rounds[0].votes, { [ctx.agents[0].id]: 5 });
  assert.equal(ctx.agents[1].votes.length, 0);
});

test('divine action narration prefers natural action speech and falls back to deterministic results', () => {
  const ctx = runtime();
  applyActionResults(
    ctx as never,
    { config: { day: 1, actionType: 'witch_poison' } } as never,
    [{ actorId: 4, payload: { use: 'false', target: 5 } }],
  );
  assert.equal(ctx.state.rounds[0].night.witchPoisonTarget, null);

  assert.equal(
    getActionPhaseConfig('witch_poison')?.buildMessages(
      1,
      { witchPoisonUsed: true, target: 5, reason: '我今晚选择毒掉5号，因为他的投票和发言明显矛盾。' },
    ).result,
    '我今晚选择毒掉5号，因为他的投票和发言明显矛盾。',
  );
  assert.equal(
    getActionPhaseConfig('witch_poison')?.buildMessages(1, { witchPoisonUsed: true, target: 5 }).result,
    '女巫毒了5号。',
  );
  assert.equal(getActionPhaseConfig('witch_poison')?.buildMessages(1, { witchPoisonUsed: false }).result, '');
  assert.equal(
    getActionPhaseConfig('guard_protect')?.buildMessages(
      1,
      { guardTarget: 2, reason: '我今晚守护2号，他很可能是关键神职。' },
    ).result,
    '我今晚守护2号，他很可能是关键神职。',
  );
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

test('withdrawn sheriff candidates cannot vote in initial or runoff ballots', () => {
  const round = createRound(1);
  round.phase = 'day';
  round.sheriffElection = {
    signedUpIds: [1, 2, 3],
    speechOrder: [],
    speeches: [],
    withdrawnIds: [3],
    candidates: [1, 2],
    voters: [],
    votes: {},
    tally: {},
    runoffCandidateIds: [1, 2],
    runoffSpeechOrder: [],
    runoffSpeeches: [],
    runoffVotes: {},
    runoffTally: {},
    sheriffId: null,
    result: 'pending',
  };
  const ctx = {
    agents: [actor(1, 'good'), actor(2, 'good'), actor(3, 'good'), actor(4, 'good')],
    modeConfig: { sheriff: { enabled: true, firstDayElection: true } },
    state: { rounds: [round] },
  };

  assert.deepEqual(
    getActorsForStep(ctx as never, { config: { day: 1, actionType: 'sheriff_vote' } } as never, round as never)
      .map((item: TestAgent) => item.id),
    [4],
  );
  assert.deepEqual(
    getActorsForStep(ctx as never, { config: { day: 1, actionType: 'sheriff_runoff_vote' } } as never, round as never)
      .map((item: TestAgent) => item.id),
    [4],
  );

  applyActionResults(ctx as never, { config: { day: 1, actionType: 'sheriff_vote' } } as never, [
    { actorId: 3, payload: { target: 1 } },
    { actorId: 4, payload: { target: 2 } },
  ]);
  assert.deepEqual(round.sheriffElection.voters, [4]);
  assert.deepEqual(round.sheriffElection.votes, { 4: 2 });
  assert.deepEqual(round.sheriffElection.tally, { 2: 1 });

  round.sheriffElection.runoffCandidateIds = [1, 2];
  applyActionResults(ctx as never, { config: { day: 1, actionType: 'sheriff_runoff_vote' } } as never, [
    { actorId: 3, payload: { target: 1 } },
    { actorId: 4, payload: { target: 1 } },
  ]);
  assert.deepEqual(round.sheriffElection.runoffVotes, { 4: 1 });
  assert.deepEqual(round.sheriffElection.runoffTally, { 1: 1 });
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

test('workflow resolves self destruct after day speech before vote', () => {
  const steps = createWerewolfSteps();
  for (const day of [1, 2]) {
    const speechIndex = steps.findIndex((step) => step.id === `day_speech_${day}`);
    const selfDestructIndex = steps.findIndex((step) => step.id === `self_destruct_resolve_${day}`);
    const knightIndex = steps.findIndex((step) => step.id === `knight_duel_${day}`);
    const voteIndex = steps.findIndex((step) => step.id === `day_vote_${day}`);
    assert.equal(selfDestructIndex, speechIndex + 1);
    assert.equal(knightIndex, selfDestructIndex + 1);
    assert.equal(voteIndex, knightIndex + 1);
  }
});

test('postgame actions include dead players and put MVP last', () => {
  const round = createRound(1);
  const ctx = {
    agents: [
      actor(1, 'good', [], { alive: false }),
      actor(2, 'wolves'),
      actor(3, 'good', [], { alive: false }),
    ],
    modeConfig: {},
    state: { rounds: [round], mvp: { id: 1 } },
  };

  const voters = getActorsForStep(ctx as never, { config: { actionType: 'mvp_vote' } } as never, round as never);
  const speakers = getActorsForStep(ctx as never, { config: { actionType: 'postgame_speech' } } as never, round as never);
  assert.deepEqual(voters.map((item: TestAgent) => item.id), [1, 2, 3]);
  assert.deepEqual(speakers.map((item: TestAgent) => item.id), [2, 3, 1]);

  applyActionResults(ctx as never, { config: { day: 1, actionType: 'mvp_vote' } } as never, [
    { actorId: 1, payload: { target: 2 } },
    { actorId: 2, payload: { target: 2 } },
    { actorId: 3, payload: { target: 1 } },
  ]);
  applyActionResults(ctx as never, { config: { day: 1, actionType: 'postgame_speech' } } as never, [
    { actorId: 1, payload: { speak: true, text: '感谢大家。' } },
    { actorId: 2, payload: { speak: false, text: '不应保存' } },
  ]);

  assert.deepEqual((ctx.state as Record<string, unknown>).mvpVotes, { 1: 2, 3: 1 });
  assert.equal(((ctx.state as Record<string, unknown>).postgameSpeeches as Record<string, { text: string }>)['1'].text, '感谢大家。');
  assert.equal(((ctx.state as Record<string, unknown>).postgameSpeeches as Record<string, { text: string }>)['2'], undefined);
});

test('first night resolves only after sheriff election and before day speech', () => {
  const steps = createWerewolfSteps();
  const dayStart = steps.findIndex((step) => step.id === 'day_start_1');
  const sheriffResolve = steps.findIndex((step) => step.id === 'sheriff_resolve_1');
  const nightResolve = steps.findIndex((step) => step.id === 'night_resolve_1');
  const daySpeech = steps.findIndex((step) => step.id === 'day_speech_1');

  assert.ok(dayStart < sheriffResolve);
  assert.ok(sheriffResolve < nightResolve);
  assert.ok(nightResolve < daySpeech);
});

test('later nights enter day before publishing and resolving deaths', () => {
  const steps = createWerewolfSteps();
  const dayStart = steps.findIndex((step) => step.id === 'day_start_2');
  const nightResolve = steps.findIndex((step) => step.id === 'night_resolve_2');
  const daySpeech = steps.findIndex((step) => step.id === 'day_speech_2');

  assert.ok(dayStart < nightResolve);
  assert.ok(nightResolve < daySpeech);
  assert.equal(steps[nightResolve].config.phase, 'day');
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

test('witch poison always respects one potion per night after antidote use', () => {
  const ctx = runtime();
  const round = ctx.state.rounds[0];
  round.night.witchSave = true;

  assert.equal(
    getWitchActionEligibility(ctx as never, round as never, 'witch_poison').skipReason,
    'one_potion_per_night',
  );
});

test('witch antidote rejects restored poison use from the same night', () => {
  const ctx = runtime();
  const round = ctx.state.rounds[0];
  round.night.wolfTarget = 5;
  round.night.witchPoisonTarget = 2;

  assert.equal(
    getWitchActionEligibility(ctx as never, round as never, 'witch_save').skipReason,
    'one_potion_per_night',
  );
  applyActionResults(
    ctx as never,
    { config: { day: 1, actionType: 'witch_save' } } as never,
    [{ actorId: 4, payload: { use: true, target: 5 } }],
  );
  assert.equal(round.night.witchSave, false);
  assert.equal(Boolean(ctx.agents[3].usedAntidote), false);
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

test('white wolf king self destruct records and kills a valid target', () => {
  const round = createRound(1);
  const whiteWolfKing = actor(1, 'wolves', ['kill'], {
    role: 'white_wolf_king',
    roleConfig: {
      id: 'white_wolf_king',
      name: '白狼王',
      rule: { actions: [{ action: 'kill' }, { action: 'selfDestruct' }] },
    },
  });
  const target = actor(2, 'good', ['shootOnDeath']);
  const ctx = {
    agents: [whiteWolfKing, target, actor(3, 'good')],
    modeConfig: { sheriff: {}, winCondition: 'side' },
    state: { rounds: [round] },
  };

  applyActionResults(ctx as never, { config: { day: 1, actionType: 'day_speech' } } as never, [
    {
      actorId: 1,
      payload: {
        text: '我选择自爆带走2号。',
        selfDestruct: true,
        selfDestructText: '白狼王自爆。',
        target: 2,
      },
    },
  ]);
  applySelfDestruct(ctx as never, round as never);

  assert.deepEqual(round.selfDestruct, {
    playerId: 1,
    text: '白狼王自爆。',
    day: 1,
    targetId: 2,
  });
  assert.equal(ctx.agents[0].alive, false);
  assert.equal(ctx.agents[0].deathReason, 'self_destruct');
  assert.equal(ctx.agents[1].alive, false);
  assert.equal(ctx.agents[1].deathReason, 'white_wolf_king_self_destruct');
  assert.equal(findPendingHunter(ctx.agents as never, round as never, [{ id: 2 }] as never)?.id, 2);
});

test('hybrid chooses a master and records personal allegiance', () => {
  const round = createRound(1);
  const ctx = {
    agents: [
      actor(1, 'good', ['chooseMaster'], { role: 'hybrid', roleConfig: { id: 'hybrid', name: '混血儿', roleType: 'villager', rule: { actions: [{ action: 'chooseMaster' }] } } }),
      actor(2, 'wolves', ['kill'], { role: 'werewolf', roleConfig: { id: 'werewolf', roleType: 'wolf', rule: { actions: [{ action: 'kill' }] } } }),
      actor(3, 'good', [], { role: 'villager', roleConfig: { id: 'villager', roleType: 'villager', rule: { actions: [] } } }),
    ],
    modeConfig: { sheriff: {}, winCondition: 'side' },
    state: { rounds: [round], winner: 'wolves' },
  };

  assert.deepEqual(
    getActorsForStep(ctx as never, { config: { day: 1, actionType: 'hybrid_choose_master' } } as never, round as never).map((item: TestAgent) => item.id),
    [1],
  );
  applyActionResults(ctx as never, { config: { day: 1, actionType: 'hybrid_choose_master' } } as never, [
    { actorId: 1, payload: { target: 2 } },
  ]);

  assert.equal(ctx.agents[0].hybridMasterId, 2);
  assert.deepEqual((ctx.state as Record<string, unknown>).hybridResults, { 1: { masterId: 2, masterFaction: 'wolves', winner: 'wolves', won: true } });
});

test('silence elder cannot silence the same target on consecutive nights and silenced players skip speech only', () => {
  const round = createRound(2);
  const elder = actor(1, 'good', ['silence'], { lastSilencedTarget: 3 });
  const ctx = {
    agents: [
      elder,
      actor(2, 'wolves', ['kill']),
      actor(3, 'good'),
      actor(4, 'good'),
    ],
    modeConfig: { sheriff: {} },
    state: { rounds: [round] },
  };

  assert.deepEqual(getTargetIds(ctx as never, { config: { day: 2, actionType: 'elder_silence' } } as never), [1, 2, 4]);
  applyActionResults(ctx as never, { config: { day: 2, actionType: 'elder_silence' } } as never, [
    { actorId: 1, payload: { target: 4, reason: '压制强狼位' } },
  ]);

  assert.equal(round.silencedPlayerId, 4);
  assert.equal(round.silenceReason, '压制强狼位');
  assert.equal(elder.lastSilencedTarget, 4);
  const speechActorIds = getActorsForStep(
    ctx as never,
    { config: { day: 2, actionType: 'day_speech' } } as never,
    round as never,
  ).map((item: TestAgent) => item.id);
  assert.equal(speechActorIds.includes(4), false);
  assert.deepEqual([...speechActorIds].sort((a, b) => a - b), [1, 2, 3]);
  assert.deepEqual(
    getActorsForStep(ctx as never, { config: { day: 2, actionType: 'day_vote' } } as never, round as never).map((item: TestAgent) => item.id),
    [1, 2, 3, 4],
  );
});

test('knight duel kills wolf target and skips day vote, or kills knight on good target once', () => {
  const wolfRound = createRound(1);
  const wolfCtx = {
    agents: [
      actor(1, 'good', ['duel'], { role: 'knight' }),
      actor(2, 'wolves', ['kill'], { role: 'werewolf' }),
      actor(3, 'good'),
    ],
    modeConfig: { sheriff: {}, winCondition: 'side' },
    state: { rounds: [wolfRound] },
  };

  applyActionResults(wolfCtx as never, { config: { day: 1, actionType: 'knight_duel' } } as never, [
    { actorId: 1, payload: { target: 2, reason: '验明2号冲票' } },
  ]);

  assert.deepEqual(wolfRound.knightDuel, { actorId: 1, targetId: 2, targetFaction: 'wolves', success: true, reason: '验明2号冲票' });
  assert.equal(wolfCtx.agents[1].alive, false);
  assert.equal(wolfCtx.agents[1].deathReason, 'knight_duel');
  assert.deepEqual(getActorsForStep(wolfCtx as never, { config: { day: 1, actionType: 'day_vote' } } as never, wolfRound as never), []);

  const goodRound = createRound(1);
  const knight = actor(1, 'good', ['duel'], { role: 'knight' });
  const goodCtx = {
    agents: [knight, actor(2, 'good'), actor(3, 'wolves', ['kill'])],
    modeConfig: { sheriff: {}, winCondition: 'side' },
    state: { rounds: [goodRound] },
  };

  applyActionResults(goodCtx as never, { config: { day: 1, actionType: 'knight_duel' } } as never, [
    { actorId: 1, payload: { target: 2 } },
  ]);

  assert.equal(knight.alive, false);
  assert.equal(knight.deathReason, 'knight_duel_failed');
  assert.equal(knight.knightDuelUsed, true);
  assert.deepEqual(
    getActorsForStep(goodCtx as never, { config: { day: 1, actionType: 'knight_duel' } } as never, goodRound as never),
    [],
  );
  assert.deepEqual(
    getActorsForStep(goodCtx as never, { config: { day: 1, actionType: 'day_vote' } } as never, goodRound as never).map((item: TestAgent) => item.id),
    [2, 3],
  );
});

test('workflow inserts hybrid, dreamer, elder, and knight actions in board order', () => {
  const steps = createWerewolfSteps();
  const assign = steps.findIndex((step) => step.id === 'assign_roles');
  const hybrid = steps.findIndex((step) => step.id === 'hybrid_choose_master_1');
  const nightStart = steps.findIndex((step) => step.id === 'night_start_1');
  const requester = steps.findIndex((step) => step.id === 'requester_pray_1');
  const fortuneTeller = steps.findIndex((step) => step.id === 'fortune_teller_mark_1');
  const magician = steps.findIndex((step) => step.id === 'magician_swap_1');
  const dreamer = steps.findIndex((step) => step.id === 'dreamer_dream_1');
  const nightmare = steps.findIndex((step) => step.id === 'nightmare_fear_1');
  const penguin = steps.findIndex((step) => step.id === 'penguin_freeze_1');
  const butterfly = steps.findIndex((step) => step.id === 'butterfly_hug_1');
  const stalker = steps.findIndex((step) => step.id === 'stalker_assassinate_1');
  const elder = steps.findIndex((step) => step.id === 'elder_silence_1');
  const wolfVote = steps.findIndex((step) => step.id === 'wolf_vote_1');
  const wolfSeed = steps.findIndex((step) => step.id === 'wolf_seed_infect_1');
  const bigBadWolf = steps.findIndex((step) => step.id === 'big_bad_wolf_kill_1');
  const wolfBeauty = steps.findIndex((step) => step.id === 'wolf_beauty_charm_1');
  const demon = steps.findIndex((step) => step.id === 'demon_inspect_1');
  const heavenlyEye = steps.findIndex((step) => step.id === 'heavenly_eye_check_1');
  const blackMerchant = steps.findIndex((step) => step.id === 'black_merchant_gift_1');
  const luckySeer = steps.findIndex((step) => step.id === 'lucky_seer_check_1');
  const witchPoison = steps.findIndex((step) => step.id === 'witch_poison_1');
  const luckyPoison = steps.findIndex((step) => step.id === 'lucky_witch_poison_1');
  const youngerBrother = steps.findIndex((step) => step.id === 'younger_brother_kill_1');
  const requesterKill = steps.findIndex((step) => step.id === 'requester_kill_1');
  const crow = steps.findIndex((step) => step.id === 'crow_curse_1');
  const dayStart = steps.findIndex((step) => step.id === 'day_start_1');
  const nightResolve = steps.findIndex((step) => step.id === 'night_resolve_1');
  const bearTamer = steps.findIndex((step) => step.id === 'bear_tamer_roar_1');
  const selfDestruct = steps.findIndex((step) => step.id === 'self_destruct_resolve_1');
  const knight = steps.findIndex((step) => step.id === 'knight_duel_1');
  const vote = steps.findIndex((step) => step.id === 'day_vote_1');

  const expectedOrder = [
    assign, hybrid, nightStart, requester, fortuneTeller, magician, dreamer, nightmare,
    penguin, butterfly, stalker, elder, wolfVote, wolfSeed, bigBadWolf, wolfBeauty,
    demon, heavenlyEye, steps.findIndex((step) => step.id === 'seer_check_1'), blackMerchant,
    luckySeer, witchPoison, luckyPoison, youngerBrother, requesterKill, crow, dayStart,
    nightResolve, bearTamer, selfDestruct, knight, vote,
  ];
  assert.ok(expectedOrder.every((index) => index >= 0));
  assert.deepEqual([...expectedOrder].sort((a, b) => a - b), expectedOrder);
});

test('reducers record wolf seed infection and heavenly eye role checks', () => {
  const round = createRound(1);
  round.night.wolfTarget = 4;
  const seed = actor(1, 'wolves', ['kill', 'infect'], { role: 'wolf_seed' });
  const eye = actor(2, 'good', ['inspectRole'], { role: 'heavenly_eye' });
  const ctx = {
    agents: [
      seed,
      eye,
      actor(3, 'wolves', ['kill'], { role: 'werewolf' }),
      actor(4, 'good', [], { role: 'hunter', roleLabel: '猎人' }),
    ],
    modeConfig: { id: 'wolf-seed-hidden-wolf-12', sheriff: {}, winCondition: 'side' },
    state: { rounds: [round] },
  };

  assert.deepEqual(getActorsForStep(ctx as never, { config: { day: 1, actionType: 'wolf_seed_infect' } } as never, round as never).map((item: TestAgent) => item.id), [1]);
  applyActionResults(ctx as never, { config: { day: 1, actionType: 'wolf_seed_infect' } } as never, [
    { actorId: 1, payload: { use: true, reason: 'convert wolf target' } },
  ]);
  applyActionResults(ctx as never, { config: { day: 1, actionType: 'heavenly_eye_check' } } as never, [
    { actorId: 2, payload: { target: 4, reason: 'check exact role' } },
  ]);

  assert.deepEqual(round.night.wolfSeedInfect, { actorId: 1, targetId: 4, used: true, success: false, reason: 'convert wolf target' });
  assert.deepEqual(round.night.heavenlyEyeCheck, { target: 4, roleId: 'hunter', roleName: '猎人', reason: 'check exact role' });
  assert.equal(seed.wolfSeedInfectUsed, true);
});

test('reducers apply requester prayer rewards and solo kill', () => {
  const round = createRound(1);
  const requester = actor(1, 'good', ['request', 'voteDouble'], { role: 'requester' });
  const ctx = {
    agents: [
      requester,
      actor(2, 'good', [], { role: 'villager' }),
      actor(3, 'good', ['poison'], { role: 'witch' }),
      actor(4, 'wolves', ['kill'], { role: 'demon' }),
      actor(5, 'good'),
    ],
    modeConfig: { id: 'heavenly-eye-requester-12', sheriff: {}, winCondition: 'side' },
    state: { rounds: [round] },
  };

  applyActionResults(ctx as never, { config: { day: 1, actionType: 'requester_pray' } } as never, [
    { actorId: 1, payload: { target: 3, reason: 'borrow poison' } },
  ]);
  assert.equal(requester.requesterGift, 'poison');
  assert.equal(requester.requesterPrayUsed, true);
  assert.equal(requester.blackMerchantGift?.action, 'poison');

  requester.requesterPrayUsed = false;
  requester.blackMerchantGift = null;
  applyActionResults(ctx as never, { config: { day: 1, actionType: 'requester_pray' } } as never, [
    { actorId: 1, payload: { target: 4, reason: 'bad prayer' } },
  ]);
  assert.equal(requester.faction, 'third_party');
  assert.equal(requester.requesterGift, 'soloKill');
  assert.deepEqual(getActorsForStep(ctx as never, { config: { day: 1, actionType: 'requester_kill' } } as never, round as never).map((item: TestAgent) => item.id), [1]);

  applyActionResults(ctx as never, { config: { day: 1, actionType: 'requester_kill' } } as never, [
    { actorId: 1, payload: { target: 5, reason: 'third party kill' } },
  ]);
  assert.equal(round.night.requesterTarget, 5);
  assert.equal(round.night.requesterReason, 'third party kill');
});

test('butterfly hug blocks wolf team kill and tracks limited uses', () => {
  const round = createRound(1);
  const butterfly = actor(1, 'good', ['hug'], { role: 'butterfly', butterflyHugUsed: 1 });
  const wolf = actor(2, 'wolves', ['kill'], { role: 'werewolf' });
  const ctx = {
    agents: [butterfly, wolf, actor(3, 'good')],
    modeConfig: { sheriff: {}, winCondition: 'side' },
    state: { rounds: [round] },
  };

  applyActionResults(ctx as never, { config: { day: 1, actionType: 'butterfly_hug' } } as never, [
    { actorId: 1, payload: { target: 2, reason: '压制狼刀' } },
  ]);

  assert.equal(round.night.butterflyTarget, 2);
  assert.equal(round.night.butterflyReason, '压制狼刀');
  assert.equal(butterfly.butterflyHugUsed, 2);
  assert.deepEqual(getActorsForStep(ctx as never, { config: { day: 1, actionType: 'wolf_kill' } } as never, round as never), []);
});

test('stalker can assassinate previous vote target only when not exiled and only once', () => {
  const previous = createRound(1);
  previous.votes = { 1: 3, 2: 3, 3: 2 };
  previous.exile = { id: 2, reason: '放逐' };
  const round = createRound(2);
  const stalker = actor(1, 'good', ['stalk'], { role: 'stalker' });
  const ctx = {
    agents: [stalker, actor(2, 'good', [], { alive: false }), actor(3, 'wolves', ['kill'])],
    modeConfig: { sheriff: {}, winCondition: 'side' },
    state: { rounds: [previous, round] },
  };

  assert.deepEqual(getTargetIds(ctx as never, { config: { day: 2, actionType: 'stalker_assassinate' } } as never), [3]);
  applyActionResults(ctx as never, { config: { day: 2, actionType: 'stalker_assassinate' } } as never, [
    { actorId: 1, payload: { use: true, target: 3, reason: '昨天投票未出局' } },
  ]);

  assert.equal(round.night.stalkerTarget, 3);
  assert.equal(round.night.stalkerReason, '昨天投票未出局');
  assert.equal(stalker.stalkerAssassinateUsed, true);
  assert.deepEqual(getActorsForStep(ctx as never, { config: { day: 2, actionType: 'stalker_assassinate' } } as never, round as never), []);
});

test('nightmare fear blocks target action and cannot repeat the same target next night', () => {
  const round = createRound(1);
  const nightmare = actor(1, 'wolves', ['fear'], { role: 'nightmare' });
  const seer = actor(2, 'good', ['check'], { role: 'seer' });
  const ctx = {
    agents: [nightmare, seer, actor(3, 'good')],
    modeConfig: { sheriff: {}, winCondition: 'side' },
    state: { rounds: [round] },
  };

  applyActionResults(ctx as never, { config: { day: 1, actionType: 'nightmare_fear' } } as never, [
    { actorId: 1, payload: { target: 2, reason: 'block seer' } },
  ]);

  assert.equal(round.night.nightmareTarget, 2);
  assert.equal(round.night.nightmareReason, 'block seer');
  assert.equal(nightmare.lastNightmareTarget, 2);
  assert.deepEqual(getActorsForStep(ctx as never, { config: { day: 1, actionType: 'seer_check' } } as never, round as never), []);
  assert.deepEqual(getTargetIds(ctx as never, { config: { day: 2, actionType: 'nightmare_fear' } } as never), [3]);
});

test('nightmare fear blocks wolf special night actions before actor selection', () => {
  const charmRound = createRound(1);
  const wolfBeauty = actor(2, 'wolves', ['charm'], { role: 'wolf_beauty' });
  const charmCtx = {
    agents: [actor(1, 'wolves', ['fear'], { role: 'nightmare' }), wolfBeauty, actor(3, 'good')],
    modeConfig: { sheriff: {}, winCondition: 'side' },
    state: { rounds: [charmRound] },
  };
  charmRound.night.nightmareTarget = 2;
  assert.deepEqual(getActorsForStep(charmCtx as never, { config: { day: 1, actionType: 'wolf_beauty_charm' } } as never, charmRound as never), []);

  const inspectRound = createRound(1);
  const demon = actor(2, 'wolves', ['inspectRoleType'], { role: 'demon' });
  const inspectCtx = {
    agents: [actor(1, 'wolves', ['fear'], { role: 'nightmare' }), demon, actor(3, 'good')],
    modeConfig: { sheriff: {}, winCondition: 'side' },
    state: { rounds: [inspectRound] },
  };
  inspectRound.night.nightmareTarget = 2;
  assert.deepEqual(getActorsForStep(inspectCtx as never, { config: { day: 1, actionType: 'demon_inspect' } } as never, inspectRound as never), []);
});

test('demon inspect records god-or-not result and demon is immune to witch poison', () => {
  const round = createRound(1);
  const demon = actor(1, 'wolves', ['inspectRoleType'], { role: 'demon' });
  const guard = actor(2, 'good', ['protect'], { role: 'guard' });
  const villager = actor(3, 'good', [], { role: 'villager' });
  const ctx = {
    agents: [demon, guard, villager],
    modeConfig: { sheriff: {}, winCondition: 'side' },
    state: { rounds: [round] },
  };

  applyActionResults(ctx as never, { config: { day: 1, actionType: 'demon_inspect' } } as never, [
    { actorId: 1, payload: { target: 2, reason: 'find god' } },
  ]);
  assert.deepEqual(round.night.demonInspect, { target: 2, result: '神职', reason: 'find god' });

  round.night.witchPoisonTarget = 1;
  const result = resolveNightEffects(ctx.agents as never, round as never, ctx.modeConfig);
  assert.equal(demon.alive, true);
  assert.deepEqual(result.deaths, []);
});

test('wolf beauty charm links death when wolf beauty dies at night', () => {
  const round = createRound(1);
  const wolfBeauty = actor(1, 'wolves', ['charm'], { role: 'wolf_beauty' });
  const guard = actor(2, 'good', ['protect'], { role: 'guard' });
  const ctx = {
    agents: [wolfBeauty, guard, actor(3, 'good')],
    modeConfig: { sheriff: {}, winCondition: 'side' },
    state: { rounds: [round] },
  };

  applyActionResults(ctx as never, { config: { day: 1, actionType: 'wolf_beauty_charm' } } as never, [
    { actorId: 1, payload: { target: 2, reason: 'bind guard' } },
  ]);
  round.night.witchPoisonTarget = 1;
  const result = resolveNightEffects(ctx.agents as never, round as never, ctx.modeConfig);

  assert.equal(round.night.wolfBeautyTarget, 2);
  assert.equal(wolfBeauty.alive, false);
  assert.equal(guard.alive, false);
  assert.deepEqual(result.deaths.map((death) => death.id).sort((a, b) => a - b), [1, 2]);
});

test('new batch modes are configured as 12-player lineups', () => {
  const modes = new Map(DEFAULT_WEREWOLF_MODES.map((mode) => [mode.id, mode]));
  for (const id of ['evil-knight-guard-12', 'wolf-beauty-rogue-12']) {
    const mode = modes.get(id);
    assert.ok(mode, `${id} should exist`);
    assert.equal(mode!.roles.reduce((sum, item) => sum + item.count, 0), 12);
  }
});

test('evil knight reflects witch poison and seer checks once per night', () => {
  const round = createRound(1);
  const evilKnight = actor(1, 'wolves', ['kill'], { role: 'evil_knight' });
  const witch = actor(2, 'good', ['poison'], { role: 'witch' });
  const seer = actor(3, 'good', ['inspectFaction'], { role: 'seer' });
  const agents = [evilKnight, witch, seer, actor(4, 'good')];

  round.night.witchPoisonTarget = 1;
  round.night.seerCheck = { target: 1, result: 'wolves' };
  const result = resolveNightEffects(agents as never, round as never, { winCondition: 'side' });

  assert.equal(evilKnight.alive, true);
  assert.equal(witch.alive, false);
  assert.equal(seer.alive, true);
  assert.equal(evilKnight.evilKnightTriggered, true);
  assert.deepEqual(round.evilKnightTrigger, { actorId: 1, trigger: 'witch_poison', targetId: 2 });
  assert.deepEqual(result.deaths.map((death) => death.id), [2]);
});

test('evil knight reflects seer check when poison does not trigger it', () => {
  const round = createRound(1);
  const evilKnight = actor(1, 'wolves', ['kill'], { role: 'evil_knight' });
  const witch = actor(2, 'good', ['poison'], { role: 'witch' });
  const seer = actor(3, 'good', ['inspectFaction'], { role: 'seer' });
  const agents = [evilKnight, witch, seer, actor(4, 'good')];

  round.night.seerCheck = { target: 1, result: 'wolves' };
  const result = resolveNightEffects(agents as never, round as never, { winCondition: 'side' });

  assert.equal(evilKnight.alive, true);
  assert.equal(witch.alive, true);
  assert.equal(seer.alive, false);
  assert.deepEqual(round.evilKnightTrigger, { actorId: 1, trigger: 'seer_check', targetId: 3 });
  assert.deepEqual(result.deaths.map((death) => death.id), [3]);
});

test('old rogue delays poison and hunter shot deaths until next day speech ends', () => {
  const nightRound = createRound(1);
  const oldRogue = actor(1, 'good', [], { role: 'old_rogue' });
  const witch = actor(2, 'good', ['poison'], { role: 'witch' });
  const agents = [oldRogue, witch, actor(3, 'wolves', ['kill'], { role: 'werewolf' })];

  nightRound.night.witchPoisonTarget = 1;
  const night = resolveNightEffects(agents as never, nightRound as never, { winCondition: 'side' });
  assert.equal(oldRogue.alive, true);
  assert.deepEqual(night.deaths, []);
  assert.equal(oldRogue.oldRoguePendingDeath?.sourceAction, 'witch_poison');
  assert.equal(oldRogue.oldRoguePendingDeath?.announced, false);

  const dayRound = createRound(2);
  const ctx = { agents, modeConfig: { sheriff: {}, winCondition: 'side' }, state: { rounds: [nightRound, dayRound] } };
  applyActionResults(ctx as never, { config: { day: 2, actionType: 'day_speech' } } as never, [
    { actorId: 1, payload: { text: 'last info' } },
  ]);
  assert.equal(oldRogue.alive, false);
  assert.deepEqual(dayRound.oldRogueDeath, { id: 1, reason: '女巫毒杀', sourceAction: 'witch_poison' });

  const shotRound = createRound(1);
  const shotRogue = actor(4, 'good', [], { role: 'old_rogue' });
  const hunter = actor(5, 'good', ['shootOnDeath'], { role: 'hunter' });
  const shotAgents = [shotRogue, hunter];
  const shot = applyHunterShot(shotAgents as never, shotRound as never, { from: 5, target: 4 });
  assert.equal(shot?.target, 4);
  assert.equal(shotRogue.alive, true);
  assert.equal(shotRogue.oldRoguePendingDeath?.sourceAction, 'hunter_shot');
  assert.equal(shotRogue.oldRoguePendingDeath?.announced, true);
});

test('wolf beauty rogue board suppresses poison charm and old rogue charm death', () => {
  const poisonRound = createRound(1);
  const wolfBeauty = actor(1, 'wolves', ['charm'], { role: 'wolf_beauty' });
  const target = actor(2, 'good', [], { role: 'villager' });
  poisonRound.night.wolfBeautyTarget = 2;
  poisonRound.night.witchPoisonTarget = 1;
  const poisonResult = resolveNightEffects([wolfBeauty, target] as never, poisonRound as never, { id: 'wolf-beauty-rogue-12', winCondition: 'side' });
  assert.equal(wolfBeauty.alive, false);
  assert.equal(target.alive, true);
  assert.deepEqual(poisonResult.deaths.map((death) => death.id), [1]);

  const charmRound = createRound(1);
  const wolfBeauty2 = actor(1, 'wolves', ['charm'], { role: 'wolf_beauty' });
  const oldRogue = actor(2, 'good', [], { role: 'old_rogue' });
  charmRound.night.wolfBeautyTarget = 2;
  charmRound.night.wolfTarget = 1;
  const charmResult = resolveNightEffects([wolfBeauty2, oldRogue] as never, charmRound as never, { id: 'wolf-beauty-guard-12', winCondition: 'side' });
  assert.equal(wolfBeauty2.alive, false);
  assert.equal(oldRogue.alive, true);
  assert.deepEqual(charmResult.deaths.map((death) => death.id), [1]);
});

test('reducers record fortune teller mark, big bad wolf kill, crow curse, and bear roar', () => {
  const round = createRound(1);
  const fortuneTeller = actor(1, 'good', ['mark'], { role: 'fortune_teller' });
  const bigBadWolf = actor(2, 'wolves', ['soloKill'], { role: 'big_bad_wolf' });
  const crow = actor(3, 'good', ['curse'], { role: 'crow' });
  const bearTamer = actor(4, 'good', ['bearRoar'], { role: 'bear_tamer' });
  const ctx = {
    agents: [fortuneTeller, bigBadWolf, crow, bearTamer, actor(5, 'wolves', ['kill'], { role: 'werewolf' }), actor(6, 'good')],
    modeConfig: { sheriff: {}, winCondition: 'side' },
    state: { rounds: [round] },
  };

  applyActionResults(ctx as never, { config: { day: 1, actionType: 'fortune_teller_mark' } } as never, [
    { actorId: 1, payload: { target: 5, reason: 'limit wolves' } },
  ]);
  applyActionResults(ctx as never, { config: { day: 1, actionType: 'big_bad_wolf_kill' } } as never, [
    { actorId: 2, payload: { target: 6, reason: 'solo bite' } },
  ]);
  applyActionResults(ctx as never, { config: { day: 1, actionType: 'crow_curse' } } as never, [
    { actorId: 3, payload: { target: 6, reason: 'pressure' } },
  ]);
  applyActionResults(ctx as never, { config: { day: 1, actionType: 'bear_tamer_roar' } } as never, [
    { actorId: 4, payload: { roaring: true, adjacentWolfIds: [5] } },
  ]);

  assert.deepEqual(round.night.fortuneTellerMark, { target: 5, reason: 'limit wolves' });
  assert.equal(fortuneTeller.fortuneTellerMarkUsed, true);
  assert.deepEqual(getTargetIds(ctx as never, { config: { day: 1, actionType: 'wolf_vote' } } as never), [4, 6]);
  applyActionResults(ctx as never, { config: { day: 1, actionType: 'wolf_vote' } } as never, [
    { actorId: 5, payload: { target: 1 } },
    { actorId: 5, payload: { target: 4 } },
  ]);
  assert.deepEqual(round.night.wolfChoices, { 5: 4 });
  assert.deepEqual(round.night.bigBadWolfTarget, 6);
  assert.equal(bigBadWolf.bigBadWolfKillUsed, true);
  assert.deepEqual(round.night.crowCurse, { target: 6, reason: 'pressure' });
  assert.equal(crow.lastCrowTarget, 6);
  assert.deepEqual(round.bearRoar, { roaring: true, adjacentWolfIds: [5] });
});

test('night effects apply big bad wolf extra kill and weak hidden wolf death', () => {
  const round = createRound(1);
  const hiddenWolf = actor(1, 'wolves', [], { role: 'hidden_wolf' });
  const bigBadWolf = actor(2, 'wolves', ['soloKill'], { role: 'big_bad_wolf' });
  const normalWolf = actor(3, 'wolves', ['kill'], { role: 'werewolf' });
  const villager = actor(4, 'good');
  const hunter = actor(5, 'good');
  round.night.wolfTarget = 3;
  round.night.bigBadWolfTarget = 5;

  const result = resolveNightEffects([hiddenWolf, bigBadWolf, normalWolf, villager, hunter] as never, round as never, {
    id: 'bear-tamer-hidden-wolf-12',
    winCondition: 'side',
  });

  assert.equal(normalWolf.alive, false);
  assert.equal(hiddenWolf.alive, false);
  assert.equal(hunter.alive, false);
  assert.deepEqual(result.deaths.map((death) => death.id).sort((a, b) => a - b), [1, 3, 5]);
});

test('crow curse adds one exile vote and hidden wolf checks as good', () => {
  const round = createRound(1);
  const hiddenWolf = actor(1, 'wolves', [], { role: 'hidden_wolf' });
  const seer = actor(2, 'good', ['inspectFaction'], { role: 'seer' });
  const voter = actor(3, 'good');
  const cursed = actor(4, 'good');
  const ctx = {
    agents: [hiddenWolf, seer, voter, cursed],
    modeConfig: { sheriff: {}, winCondition: 'side' },
    state: { rounds: [round] },
  };

  applyActionResults(ctx as never, { config: { day: 1, actionType: 'seer_check' } } as never, [
    { actorId: 2, payload: { target: 1, reason: 'check hidden' } },
  ]);
  round.crowCursedPlayerId = 4;
  applyActionResults(ctx as never, { config: { day: 1, actionType: 'day_vote' } } as never, [
    { actorId: 1, payload: { target: 3 } },
    { actorId: 2, payload: { target: 3 } },
    { actorId: 3, payload: { target: 4 } },
  ]);

  assert.deepEqual(round.night.seerCheck, { target: 1, result: '好人', reason: 'check hidden' });
  assert.equal(seer.seerChecks[0].result, '好人');
  assert.equal(round.voteTally!['3'], 2);
  assert.equal(round.voteTally!['4'], 2);
});

test('hidden wolf inherits the wolf vote only after normal wolves are gone', () => {
  const round = createRound(2);
  const hiddenWolf = actor(1, 'wolves', ['soloKill'], { role: 'hidden_wolf' });
  const normalWolf = actor(2, 'wolves', ['kill'], { role: 'werewolf' });
  const villager = actor(3, 'good', [], { role: 'villager' });
  const ctx = {
    agents: [hiddenWolf, normalWolf, villager],
    modeConfig: { id: 'hidden-wolf-crow-12', sheriff: {}, winCondition: 'side' },
    state: { rounds: [round] },
  };

  assert.deepEqual(getActorsForStep(ctx as never, { config: { day: 2, actionType: 'wolf_vote' } } as never, round as never).map((item: TestAgent) => item.id), [2]);
  normalWolf.alive = false;
  assert.deepEqual(getActorsForStep(ctx as never, { config: { day: 2, actionType: 'wolf_vote' } } as never, round as never).map((item: TestAgent) => item.id), [1]);

  applyActionResults(ctx as never, { config: { day: 2, actionType: 'wolf_vote' } } as never, [
    { actorId: 1, payload: { target: 3 } },
  ]);
  assert.equal(round.night.wolfTarget, 3);
});

test('penguin freezes role actions and fox inspect loses ability on all-good scope', () => {
  const round = createRound(1);
  const penguin = actor(1, 'good', ['freeze'], { role: 'penguin' });
  const fox = actor(2, 'good', ['foxInspect'], { role: 'fox' });
  const crow = actor(3, 'good', ['curse'], { role: 'crow' });
  const bear = actor(4, 'good', ['bearRoar'], { role: 'bear_tamer' });
  const rabbit = actor(5, 'good', [], { role: 'rabbit' });
  const wolf = actor(6, 'wolves', ['kill'], { role: 'werewolf' });
  const ctx = {
    agents: [penguin, fox, crow, bear, rabbit, wolf],
    modeConfig: { id: 'animal-zoo-12', sheriff: {}, winCondition: 'side' },
    state: { rounds: [round] },
  };

  applyActionResults(ctx as never, { config: { day: 1, actionType: 'penguin_freeze' } } as never, [
    { actorId: 1, payload: { target: 3, reason: 'block curse' } },
  ]);
  assert.equal(round.night.penguinFrozenId, 3);
  assert.equal(penguin.lastPenguinTarget, 3);
  assert.deepEqual(getActorsForStep(ctx as never, { config: { day: 1, actionType: 'crow_curse' } } as never, round as never), []);

  applyActionResults(ctx as never, { config: { day: 1, actionType: 'fox_inspect' } } as never, [
    { actorId: 2, payload: { target: 4, reason: 'check cluster' } },
  ]);
  assert.deepEqual(round.night.foxInspect, { targetIds: [3, 4, 5], hasWolf: false, reason: 'check cluster' });
  assert.equal(fox.foxInspectLost, true);
  assert.deepEqual(getActorsForStep(ctx as never, { config: { day: 2, actionType: 'fox_inspect' } } as never, round as never), []);
});

test('reducers record thief choice and lover links for modes 25 to 26', () => {
  const round = createRound(1);
  const thief = actor(1, 'good', ['stealRole'], { role: 'thief' });
  const cupid = actor(2, 'good', ['linkLovers'], { role: 'cupid' });
  const succubus = actor(3, 'wolves', ['succubusLink'], { role: 'succubus' });
  const wolf = actor(4, 'wolves', ['kill'], { role: 'werewolf' });
  const villager = actor(5, 'good', [], { role: 'villager' });
  const ctx = {
    agents: [thief, cupid, succubus, wolf, villager],
    modeConfig: { sheriff: {}, winCondition: 'side' },
    state: { rounds: [round] },
  };

  applyActionResults(ctx as never, { config: { day: 1, actionType: 'thief_choose' } } as never, [
    { actorId: 1, payload: { roleId: 'werewolf', offeredRoleIds: ['werewolf', 'villager'], reason: 'must take wolf' } },
  ]);
  assert.equal(thief.role, 'werewolf');
  assert.equal(thief.faction, 'wolves');
  assert.deepEqual(round.night.thiefChoice, { actorId: 1, roleId: 'werewolf', offeredRoleIds: ['werewolf', 'villager'], reason: 'must take wolf' });

  applyActionResults(ctx as never, { config: { day: 1, actionType: 'cupid_link' } } as never, [
    { actorId: 2, payload: { target: 4, secondTarget: 5, reason: 'mixed lovers' } },
  ]);
  assert.deepEqual(round.night.loverLink, { actorId: 2, targetIds: [4, 5], source: 'cupid', reason: 'mixed lovers' });
  assert.equal(cupid.faction, 'third_party');
  assert.equal(wolf.faction, 'third_party');
  assert.equal(villager.faction, 'third_party');

  applyActionResults(ctx as never, { config: { day: 1, actionType: 'succubus_link' } } as never, [
    { actorId: 3, payload: { target: 5, reason: 'succubus pair' } },
  ]);
  assert.deepEqual(round.night.succubusLink, { actorId: 3, targetIds: [3, 5], reason: 'succubus pair' });
  assert.equal(succubus.faction, 'third_party');
});

test('reducers record ghost bride link, private chat, and inherited kill', () => {
  const round = createRound(1);
  const bride = actor(1, 'good', ['ghostBrideLink'], { role: 'ghost_bride' });
  const groom = actor(2, 'good', [], { role: 'villager' });
  const witness = actor(3, 'good', [], { role: 'hunter' });
  const wolf = actor(4, 'wolves', ['kill'], { role: 'werewolf' });
  const villager = actor(5, 'good', [], { role: 'villager' });
  const ctx = {
    agents: [bride, groom, witness, wolf, villager],
    modeConfig: { sheriff: {}, winCondition: 'side' },
    state: { rounds: [round] },
  };

  applyActionResults(ctx as never, { config: { day: 1, actionType: 'ghost_bride_link' } } as never, [
    { actorId: 1, payload: { target: 2, witnessId: 3, reason: 'bind pair' } },
  ]);

  assert.deepEqual(round.night.ghostBrideLink, { actorId: 1, partnerId: 2, witnessId: 3, reason: 'bind pair' });
  assert.equal(bride.loverId, 2);
  assert.equal(groom.loverId, 1);
  assert.equal(witness.witnessForGhostBride, 1);
  assert.deepEqual(ctx.agents.slice(0, 3).map((agent) => agent.faction), ['third_party', 'third_party', 'third_party']);
  assert.deepEqual(getActorsForStep(ctx as never, { config: { day: 1, actionType: 'ghost_bride_chat' } } as never, round as never).map((agent: TestAgent) => agent.id), [1, 2, 3]);

  applyActionResults(ctx as never, { config: { day: 1, actionType: 'ghost_bride_chat' } } as never, [
    { actorId: 1, payload: { text: 'stay hidden', thinking: 'linked' } },
    { actorId: 2, payload: { text: 'agree' } },
  ]);
  assert.deepEqual(round.night.ghostBrideChat?.map((item) => ({ playerId: item.playerId, text: item.text })), [
    { playerId: 1, text: 'stay hidden' },
    { playerId: 2, text: 'agree' },
  ]);

  wolf.alive = false;
  bride.alive = false;
  groom.alive = false;
  assert.deepEqual(getActorsForStep(ctx as never, { config: { day: 1, actionType: 'ghost_bride_kill' } } as never, round as never).map((agent: TestAgent) => agent.id), [3]);
  assert.deepEqual(getTargetIds(ctx as never, { config: { day: 1, actionType: 'ghost_bride_kill' } } as never), [5]);

  applyActionResults(ctx as never, { config: { day: 1, actionType: 'ghost_bride_kill' } } as never, [
    { actorId: 3, payload: { target: 5, reason: 'inherit kill' } },
  ]);
  assert.equal(round.night.ghostBrideTarget, 5);
  assert.equal(round.night.ghostBrideReason, 'inherit kill');
});

test('reducers record demon hunter hunt and magic wolf seals god skills', () => {
  const round = createRound(2);
  const magicWolf = actor(1, 'wolves', ['kill', 'selfDestruct'], { role: 'magic_wolf', magicWolfSealNightDay: 2 });
  const demonHunter = actor(2, 'good', ['demonHunterHunt'], {
    role: 'demon_hunter',
    roleConfig: { name: 'demon_hunter', roleType: 'god', rule: { actions: [{ action: 'demonHunterHunt' }] } },
  });
  const seer = actor(3, 'good', ['inspectFaction'], {
    role: 'seer',
    roleConfig: { name: 'seer', roleType: 'god', rule: { actions: [{ action: 'inspectFaction' }] } },
  });
  const villager = actor(4, 'good', [], {
    role: 'villager',
    roleConfig: { name: 'villager', roleType: 'villager', rule: { actions: [] } },
  });
  const ctx = {
    agents: [magicWolf, demonHunter, seer, villager],
    modeConfig: { id: 'magic-wolf-demon-hunter-12', sheriff: {}, winCondition: 'side' },
    state: { rounds: [round] },
  };

  assert.deepEqual(getActorsForStep(ctx as never, { config: { day: 1, actionType: 'demon_hunter_hunt' } } as never, round as never), []);
  assert.deepEqual(getActorsForStep(ctx as never, { config: { day: 2, actionType: 'demon_hunter_hunt' } } as never, round as never), []);
  assert.deepEqual(getActorsForStep(ctx as never, { config: { day: 2, actionType: 'seer_check' } } as never, round as never), []);

  magicWolf.magicWolfSealNightDay = null;
  assert.deepEqual(getActorsForStep(ctx as never, { config: { day: 2, actionType: 'demon_hunter_hunt' } } as never, round as never).map((agent: TestAgent) => agent.id), [2]);
  assert.deepEqual(getTargetIds(ctx as never, { config: { day: 2, actionType: 'demon_hunter_hunt' } } as never), [1, 3, 4]);

  applyActionResults(ctx as never, { config: { day: 2, actionType: 'demon_hunter_hunt' } } as never, [
    { actorId: 2, payload: { target: 1, reason: 'hunt wolf' } },
  ]);

  assert.equal(round.night.demonHunterTarget, 1);
  assert.equal(round.night.demonHunterReason, 'hunt wolf');
});

test('escape hunters share one legal deterministic night target', () => {
  const round = createRound(1);
  const ctx = {
    agents: [
      actor(1, 'hunters', ['hunterHunt'], { role: 'escape_hunter' }),
      actor(2, 'hunters', ['hunterHunt'], { role: 'escape_hunter' }),
      actor(3, 'hunters', ['hunterHunt'], { role: 'escape_hunter' }),
      actor(4, 'good', [], { role: 'thick_wolf' }),
      actor(5, 'good', [], { role: 'villager' }),
    ],
    modeConfig: { id: 'wolf-escape-10', sheriff: {}, winCondition: 'wolf_escape' },
    state: { rounds: [round] },
  };

  assert.deepEqual(
    getActorsForStep(ctx as never, { config: { day: 1, actionType: 'escape_hunter_vote' } } as never, round as never)
      .map((agent: TestAgent) => agent.id),
    [1, 2, 3],
  );
  assert.deepEqual(
    getTargetIds(ctx as never, { config: { day: 1, actionType: 'escape_hunter_vote' } } as never),
    [4, 5],
  );

  applyActionResults(ctx as never, { config: { day: 1, actionType: 'escape_hunter_vote' } } as never, [
    { actorId: 1, payload: { target: 4 } },
    { actorId: 2, payload: { target: 4 } },
    { actorId: 3, payload: { target: 2 } },
  ]);

  assert.deepEqual(round.night.escapeHunterChoices, { 1: 4, 2: 4 });
  assert.deepEqual(round.night.escapeHunterVoteTally, { 4: 2 });
  assert.equal(round.night.escapeHunterTarget, 4);

  const steps = createWerewolfSteps();
  const speechIndex = steps.findIndex((step) => step.id === 'escape_hunter_speech_1');
  const voteIndex = steps.findIndex((step) => step.id === 'escape_hunter_vote_1');
  const seerIndex = steps.findIndex((step) => step.id === 'seer_check_1');
  assert.ok(speechIndex >= 0 && voteIndex > speechIndex && seerIndex > voteIndex);
});

test('witch can save the escape hunter shared target', () => {
  const round = createRound(1);
  round.night.escapeHunterTarget = 4;
  const witch = actor(1, 'good', ['save', 'poison'], { role: 'witch', usedAntidote: false });
  const ctx = {
    agents: [witch, actor(4, 'good', [], { role: 'thick_wolf' })],
    modeConfig: { id: 'wolf-escape-10', witch: {}, sheriff: {}, winCondition: 'wolf_escape' },
    state: { rounds: [round] },
  };

  assert.equal(getWitchActionEligibility(ctx as never, round as never, 'witch_save').actor?.id, 1);
  applyActionResults(ctx as never, { config: { day: 1, actionType: 'witch_save' } } as never, [
    { actorId: 1, payload: { use: true, reason: 'protect wolf' } },
  ]);
  assert.equal(round.night.witchSave, true);
  assert.equal(round.night.witchSaveTarget, 4);
});

test('seer checks escape hunter as wolf in mode 29', () => {
  const round = createRound(1);
  const seer = actor(1, 'good', ['inspectFaction'], { role: 'seer' });
  const escapeHunter = actor(2, 'hunters', ['hunterHunt'], { role: 'escape_hunter' });
  const ctx = {
    agents: [seer, escapeHunter],
    modeConfig: { id: 'wolf-escape-10', sheriff: {}, winCondition: 'wolf_escape' },
    state: { rounds: [round] },
  };

  applyActionResults(ctx as never, { config: { day: 1, actionType: 'seer_check' } } as never, [
    { actorId: 1, payload: { target: 2 } },
  ]);

  assert.equal(round.night.seerCheck?.result, '狼人');
});
