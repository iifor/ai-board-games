import test from 'node:test';
import assert from 'node:assert/strict';
import * as repo from '../../packages/server/modules/workflow-engine/repository';
import { createActionWindowHandler } from '../../packages/server/modules/werewolf/handlers/actionWindowHandler';
import { createNightResolveHandler, createExileResolveHandler, createSheriffResolveHandler } from '../../packages/server/modules/werewolf/handlers/resolveHandlers';
import { createRound } from '../../packages/server/modules/werewolf/agents';
import { createInitialWerewolfState, createRuntime, flushMatchEventPublishes, registerMatchInfra, serializeWerewolfState, unregisterMatchInfra } from '../../packages/server/modules/werewolf/runtime';
import { createEventBusWithDefaults } from '../../packages/server/modules/werewolf/eventBus';
import { createGameEventBuilder } from '../../packages/server/modules/werewolf/gameEventBuilder';
import { buildWerewolfActionPrompt } from '../../packages/server/modules/werewolf/prompts/context';

type RepoPatch = Pick<typeof repo,
  'upsertActionWindowEpoch' |
  'listEvents' |
  'createAiTask' |
  'listAiTasks' |
  'listPendingActions' |
  'createWorkflowEffect'
>;

test('initial werewolf state normalizes selected database ids to seat numbers', () => {
  const selectedIds = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 20];
  const state = createInitialWerewolfState({
    werewolfMode: 'standard-12',
    players: selectedIds.map((id) => ({ id, nickname: `P${id}` })),
  });

  assert.deepEqual(state.players?.map((player) => player.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(state.players?.map((player) => player.sourcePlayerId), selectedIds);
  assert.equal(state.players?.[10].id, 11);
  assert.equal(state.players?.[10].sourcePlayerId, 14);
});

test('absent role action skips stay system-only', () => {
  const state = createState();
  const match = { id: 'm-absent-role', config: { players: state.players }, createdAt: 'now' };
  const step = {
    id: 'ghost_bride_link_1',
    type: 'werewolf.action_window',
    config: { day: 1, phase: 'night', actionType: 'ghost_bride_link', optional: true },
  };

  const result = createActionWindowHandler().execute({ match, step, state } as never);

  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.events?.[0].channel, 'system');
  assert.equal(result.events?.[0].visibility, 'system');
});

test('fake werewolf action window opens, completes, and night resolve emits effects', () => {
  const original = snapshotRepo(repo);
  const tasks: Array<Record<string, unknown>> = [];
  const epochs: Array<Record<string, unknown>> = [];
  const effects: Array<Record<string, unknown>> = [];
  try {
    patchRepo(repo, {
      upsertActionWindowEpoch: (epoch: never) => { epochs.push(epoch); return epoch; },
      listEvents: () => [],
      createAiTask: (task: never) => { tasks.push({ ...task, status: task.status || 'queued', result: null }); },
      listPendingActions: () => [],
      listAiTasks: () => tasks as never,
      createWorkflowEffect: (effect: never) => { effects.push(effect); return effect; }
    });

    const state = createState();
    state.players = [
      ...(state.players as Record<string, unknown>[]),
      player(4, 'seer', 'good', ['inspectFaction'])
    ];
    state.rounds[0].night.wolfLeaderId = 2;
    const match = { id: 'm-fake', config: { players: state.players }, createdAt: 'now' };
    const wolfStep = { id: 'wolf_kill_1', type: 'werewolf.action_window', config: { day: 1, phase: 'night', actionType: 'wolf_kill' } };
    const actionHandler = createActionWindowHandler();

    const opened = actionHandler.execute({ match, step: wolfStep, state } as never);
    assert.equal(opened.status, 'WAITING');
    assert.equal(opened.tasks?.length, 1);
    assert.equal(opened.events?.[0].type, 'werewolf_action_requested');
    tasks.push(...(opened.tasks || []));

    tasks[0] = {
      ...tasks[0],
      status: 'succeeded',
      playerId: 1,
      result: { payload: { target: 2, speech: 'target 2' } }
    };
    const completed = actionHandler.execute({ match, step: wolfStep, state: opened.state } as never);
    assert.equal(completed.status, 'COMPLETED');
    assert.equal(completed.state?.rounds[0].night.wolfTarget, 2);
    const actionAuditEvent = (completed.events || []).find((event: Record<string, unknown>) => event.type === 'werewolf_action_engine_shadow_audited') as Record<string, unknown> | undefined;
    assert.equal(actionAuditEvent?.channel, 'system');
    assert.equal((actionAuditEvent?.payload as Record<string, unknown> | undefined)?.status, 'matched');

    const nightStep = { id: 'night_resolve_1', type: 'werewolf.night_resolve', config: { day: 1, phase: 'night' } };
    const nightHandler = createNightResolveHandler();
    const nightWaiting = nightHandler.execute({
      match,
      step: nightStep,
      state: completed.state
    } as never);
    const nightResolved = completeLastWordsWindow(nightHandler, match, nightStep, nightWaiting, tasks);
    assert.equal(nightResolved.status, 'COMPLETED');
    assert.equal(nightResolved.state?.rounds[0].lastWords[0].playerId, 2);
    assert.equal(effects.length, 1);
    assert.equal(nightResolved.state?.players.find((player: Record<string, unknown>) => Number(player.id) === 2).alive, false);

    const dayVotedState = {
      ...nightResolved.state,
      rounds: [{ ...nightResolved.state?.rounds[0], votes: { 1: 3, 3: 3 } }]
    };
    const exileStep = { id: 'exile_resolve_1', type: 'werewolf.exile_resolve', config: { day: 1, phase: 'day' } };
    const exileHandler = createExileResolveHandler();
    const exileWaiting = exileHandler.execute({
      match,
      step: exileStep,
      state: dayVotedState
    } as never);
    const exileResolved = completeLastWordsWindow(exileHandler, match, exileStep, exileWaiting, tasks);
    assert.equal(exileResolved.status, 'COMPLETED');
    assert.equal(exileResolved.state?.rounds[0].exile.id, 3);
    assert.equal(exileResolved.state?.rounds[0].lastWords.at(-1).playerId, 3);
  } finally {
    patchRepo(repo, original);
  }
});

test('night resolve shadow audit is emitted when hunter window pauses resolution', () => {
  const original = snapshotRepo(repo);
  const tasks: Array<Record<string, unknown>> = [];
  const epochs: Array<Record<string, unknown>> = [];
  try {
    patchRepo(repo, {
      upsertActionWindowEpoch: (epoch: never) => { epochs.push(epoch); return epoch; },
      listEvents: () => [],
      createAiTask: (task: never) => { tasks.push({ ...task, status: task.status || 'queued', result: null }); },
      listPendingActions: () => [],
      listAiTasks: () => tasks as never,
      createWorkflowEffect: (effect: never) => effect
    });

    const state = createState();
    state.players = [
      player(1, 'werewolf', 'wolves', ['kill']),
      player(2, 'hunter', 'good', ['shootOnDeath']),
      player(3, 'villager', 'good', [])
    ];
    state.rounds[0].night.wolfTarget = 2;
    const match = { id: 'm-hunter-audit', config: { players: state.players }, createdAt: 'now' };

    const nightResolved = createNightResolveHandler().execute({
      match,
      step: { id: 'night_resolve_1', type: 'werewolf.night_resolve', config: { day: 1, phase: 'night' } },
      state
    } as never);

    assert.equal(nightResolved.status, 'WAITING');
    assert.equal(nightResolved.events?.[0].type, 'werewolf_action_requested');
    const auditEvent = (nightResolved.events || []).find((event: Record<string, unknown>) => event.type === 'werewolf_night_resolution_shadow_audited') as Record<string, unknown> | undefined;
    assert.equal(auditEvent?.channel, 'system');
    assert.equal(auditEvent?.visibility, 'system');
    assert.equal((auditEvent?.payload as Record<string, unknown> | undefined)?.status, 'matched');
  } finally {
    patchRepo(repo, original);
  }
});

test('night death of one god does not complete the game while other gods survive', () => {
  const original = snapshotRepo(repo);
  const tasks: Array<Record<string, unknown>> = [];
  try {
    patchRepo(repo, {
      upsertActionWindowEpoch: (epoch: never) => epoch,
      listEvents: () => [],
      createAiTask: (task: never) => { tasks.push({ ...task, status: task.status || 'queued', result: null }); },
      listPendingActions: () => [],
      listAiTasks: () => tasks as never,
      createWorkflowEffect: (effect: never) => effect,
    });
    const state = createState();
    state.modeConfig = { ...(state.modeConfig as Record<string, unknown>), winCondition: 'side' };
    state.players = [
      player(1, 'werewolf', 'wolves', ['kill'], { roleConfig: { id: 'werewolf', faction: 'wolves', roleType: 'wolf', rule: { actions: [{ action: 'kill' }] } } }),
      player(2, 'witch', 'good', ['save', 'poison'], { roleConfig: { id: 'witch', faction: 'good', roleType: 'god', rule: { actions: [{ action: 'save' }, { action: 'poison' }] } } }),
      player(3, 'seer', 'good', ['inspectFaction'], { roleConfig: { id: 'seer', faction: 'good', roleType: 'god', rule: { actions: [{ action: 'inspectFaction' }] } } }),
      player(4, 'hunter', 'good', ['shootOnDeath'], { roleConfig: { id: 'hunter', faction: 'good', roleType: 'god', rule: { actions: [{ action: 'shootOnDeath' }] } } }),
      player(5, 'villager', 'good', [], { roleConfig: { id: 'villager', faction: 'good', roleType: 'villager', rule: { actions: [] } } }),
    ];
    state.rounds[0].night.wolfTarget = 2;
    const match = { id: 'm-one-god-death', config: { players: state.players }, createdAt: 'now' };
    const step = { id: 'night_resolve_1', type: 'werewolf.night_resolve', config: { day: 1, phase: 'night' } };
    const handler = createNightResolveHandler();

    const waiting = handler.execute({ match, step, state } as never);
    const completed = completeLastWordsWindow(handler, match, step, waiting, tasks);

    assert.equal(completed.status, 'COMPLETED');
    assert.equal(completed.state?.winner, null);
    assert.equal(completed.state?.players.find((item: Record<string, unknown>) => Number(item.id) === 2).alive, false);
    assert.equal((completed.events || []).some((event: Record<string, unknown>) => event.type === 'werewolf_game_completed'), false);
  } finally {
    patchRepo(repo, original);
  }
});

test('debug death chain rejects invalid wolf lock while seer idiot and villager survive', () => {
  const original = snapshotRepo(repo);
  try {
    patchRepo(repo, {
      upsertActionWindowEpoch: (epoch: never) => epoch,
      listEvents: () => [],
      createAiTask: (task: never) => task,
      listPendingActions: () => [],
      listAiTasks: () => [],
      createWorkflowEffect: (effect: never) => effect,
    });
    const state = createState();
    state.debugMode = true;
    state.modeConfig = { ...(state.modeConfig as Record<string, unknown>), winCondition: 'side' };
    state.players = [
      player(1, 'werewolf', 'wolves', ['kill'], { roleConfig: { id: 'werewolf', faction: 'wolves', roleType: 'wolf', rule: { actions: [{ action: 'kill' }] } } }),
      player(2, 'witch', 'good', ['save', 'poison'], { alive: false, deathDay: 2, deathReason: '狼人袭击', roleConfig: { id: 'witch', faction: 'good', roleType: 'god', rule: { actions: [{ action: 'save' }, { action: 'poison' }] } } }),
      player(3, 'hunter', 'good', ['shootOnDeath'], { alive: false, deathDay: 2, deathReason: '女巫毒杀', hunterShotUsed: true, roleConfig: { id: 'hunter', faction: 'good', roleType: 'god', rule: { actions: [{ action: 'shootOnDeath' }] } } }),
      player(4, 'seer', 'good', ['inspectFaction'], { roleConfig: { id: 'seer', faction: 'good', roleType: 'god', rule: { actions: [{ action: 'inspectFaction' }] } } }),
      player(5, 'idiot', 'good', ['surviveExileOnce'], { roleConfig: { id: 'idiot', faction: 'good', roleType: 'god', rule: { actions: [{ action: 'surviveExileOnce' }] } } }),
      player(6, 'villager', 'good', [], { roleConfig: { id: 'villager', faction: 'good', roleType: 'villager', rule: { actions: [] } } }),
    ];
    const round = createRound(2) as Record<string, unknown>;
    (round.night as { deaths: Array<{ id: number; reason: string }> }).deaths = [
      { id: 2, reason: '狼人袭击' },
      { id: 3, reason: '女巫毒杀' },
    ];
    round.nightRevealed = true;
    round.winnerLock = {
      winner: 'wolves',
      winReason: 'invalid debug lock',
      sourceFaction: 'wolves',
      sourceAction: 'wolf_kill',
      winCondition: 'side',
      triggerRoster: { wolves: 1, gods: 2, villagers: 1, good: 3 },
    };
    state.rounds = [round];
    const match = { id: 'm-debug-invalid-lock', config: { players: state.players, debugMode: true }, createdAt: 'now' };
    const step = { id: 'night_resolve_2', type: 'werewolf.night_resolve', config: { day: 2, phase: 'night' } };

    const completed = createNightResolveHandler().execute({ match, step, state } as never);
    const audit = (completed.events || []).find(
      (event: Record<string, unknown>) => event.type === 'werewolf_winner_lock_rejected',
    ) as Record<string, unknown> | undefined;

    assert.equal(completed.status, 'COMPLETED');
    assert.equal(completed.matchStatus, undefined);
    assert.equal(completed.state?.winner, null);
    assert.equal((completed.events || []).some((event: Record<string, unknown>) => event.type === 'werewolf_game_completed'), false);
    assert.equal(audit?.channel, 'system');
    assert.equal(audit?.visibility, 'system');
    assert.equal((audit?.payload as Record<string, unknown>)?.reason, 'trigger_roster_not_winning');
  } finally {
    patchRepo(repo, original);
  }
});

test('wolf kill priority stays locked when dead last god hunter shoots the last wolf', () => {
  const original = snapshotRepo(repo);
  const tasks: Array<Record<string, unknown>> = [];
  try {
    patchRepo(repo, {
      upsertActionWindowEpoch: (epoch: never) => epoch,
      listEvents: () => [],
      createAiTask: (task: never) => { tasks.push({ ...task, status: task.status || 'queued', result: null }); },
      listPendingActions: () => [],
      listAiTasks: () => tasks as never,
      createWorkflowEffect: (effect: never) => effect
    });
    const state = createState();
    state.modeConfig = { ...(state.modeConfig as Record<string, unknown>), winCondition: 'side' };
    state.players = [
      player(1, 'werewolf', 'wolves', ['kill'], { roleConfig: { id: 'werewolf', faction: 'wolves', roleType: 'wolf', rule: { actions: [{ action: 'kill' }] } } }),
      player(2, 'hunter', 'good', ['shootOnDeath'], { roleConfig: { id: 'hunter', faction: 'good', roleType: 'god', rule: { actions: [{ action: 'shootOnDeath' }] } } }),
      player(3, 'villager', 'good', [], { roleConfig: { id: 'villager', faction: 'good', roleType: 'villager', rule: { actions: [] } } }),
    ];
    state.rounds[0].night.wolfTarget = 2;
    const match = { id: 'm-wolf-priority', config: { players: state.players }, createdAt: 'now' };
    const step = { id: 'night_resolve_1', type: 'werewolf.night_resolve', config: { day: 1, phase: 'night' } };
    const handler = createNightResolveHandler();

    const opened = handler.execute({ match, step, state } as never);
    assert.equal(opened.state?.rounds[0].winnerLock?.winner, 'wolves');
    assert.equal(opened.events?.[0].payload.game.rounds[0].winnerLock, undefined);
    const hunterWindow = completeLastWordsWindow(handler, match, step, opened, tasks);
    tasks.push(...((hunterWindow.tasks as Array<Record<string, unknown>> | undefined) || []));
    const hunterTaskIndex = tasks.findIndex((task) => task.action === 'hunter_shot:2');
    tasks[hunterTaskIndex] = {
      ...tasks[hunterTaskIndex],
      status: 'succeeded',
      playerId: 2,
      result: { payload: { target: 1 } },
    };
    const afterHunter = handler.execute({ match, step, state: hunterWindow.state } as never);
    const completed = completeLastWordsWindow(handler, match, step, afterHunter, tasks);

    assert.equal(completed.status, 'COMPLETED');
    assert.equal(completed.state?.winner, 'wolves');
    assert.equal(completed.state?.players.find((item: Record<string, unknown>) => Number(item.id) === 1).alive, false);
    assert.equal((completed.events || []).filter((event: Record<string, unknown>) => event.type === 'werewolf_game_result').length, 1);
    assert.equal(completed.nextStepId, 'postgame_daybreak');
    assert.ok(completed.events?.findIndex((event: Record<string, unknown>) => event.type === 'werewolf_last_words')
      < completed.events?.findIndex((event: Record<string, unknown>) => event.type === 'werewolf_game_result'));
  } finally {
    patchRepo(repo, original);
  }
});

test('hunter shooting the last wolf gives good victory when wolf kill did not complete a side', () => {
  const original = snapshotRepo(repo);
  const tasks: Array<Record<string, unknown>> = [];
  try {
    patchRepo(repo, {
      upsertActionWindowEpoch: (epoch: never) => epoch,
      listEvents: () => [],
      createAiTask: (task: never) => { tasks.push({ ...task, status: task.status || 'queued', result: null }); },
      listPendingActions: () => [],
      listAiTasks: () => tasks as never,
      createWorkflowEffect: (effect: never) => effect
    });
    const state = createState();
    state.modeConfig = { ...(state.modeConfig as Record<string, unknown>), winCondition: 'side' };
    state.players = [
      player(1, 'werewolf', 'wolves', ['kill'], { roleConfig: { id: 'werewolf', faction: 'wolves', roleType: 'wolf', rule: { actions: [{ action: 'kill' }] } } }),
      player(2, 'hunter', 'good', ['shootOnDeath'], { roleConfig: { id: 'hunter', faction: 'good', roleType: 'god', rule: { actions: [{ action: 'shootOnDeath' }] } } }),
      player(3, 'seer', 'good', ['inspectFaction'], { roleConfig: { id: 'seer', faction: 'good', roleType: 'god', rule: { actions: [{ action: 'inspectFaction' }] } } }),
      player(4, 'villager', 'good', [], { roleConfig: { id: 'villager', faction: 'good', roleType: 'villager', rule: { actions: [] } } }),
    ];
    state.rounds[0].night.wolfTarget = 2;
    const match = { id: 'm-hunter-good-win', config: { players: state.players }, createdAt: 'now' };
    const step = { id: 'night_resolve_1', type: 'werewolf.night_resolve', config: { day: 1, phase: 'night' } };
    const handler = createNightResolveHandler();

    const opened = handler.execute({ match, step, state } as never);
    const hunterWindow = completeLastWordsWindow(handler, match, step, opened, tasks);
    tasks.push(...((hunterWindow.tasks as Array<Record<string, unknown>> | undefined) || []));
    const hunterTaskIndex = tasks.findIndex((task) => task.action === 'hunter_shot:2');
    tasks[hunterTaskIndex] = {
      ...tasks[hunterTaskIndex],
      status: 'succeeded',
      playerId: 2,
      result: { payload: { target: 1 } },
    };
    const afterHunter = handler.execute({ match, step, state: hunterWindow.state } as never);
    const completed = completeLastWordsWindow(handler, match, step, afterHunter, tasks);

    assert.equal(completed.status, 'COMPLETED');
    assert.equal(completed.state?.winner, 'good');
    assert.equal((completed.events || []).filter((event: Record<string, unknown>) => event.type === 'werewolf_game_result').length, 1);
    assert.equal(completed.nextStepId, 'postgame_daybreak');
  } finally {
    patchRepo(repo, original);
  }
});

test('chained hunters use actor-scoped action windows', () => {
  const original = snapshotRepo(repo);
  const tasks: Array<Record<string, unknown>> = [];
  const epochs: Array<Record<string, unknown>> = [];
  try {
    patchRepo(repo, {
      upsertActionWindowEpoch: (epoch: never) => {
        epochs.push({ ...epoch });
        return epoch;
      },
      listEvents: () => [],
      createAiTask: (task: never) => { tasks.push({ ...task, status: task.status || 'queued', result: null }); },
      listPendingActions: () => [],
      listAiTasks: () => tasks as never,
      createWorkflowEffect: (effect: never) => effect,
    });
    const state = createState();
    state.players = [
      player(1, 'werewolf', 'wolves', ['kill']),
      player(2, 'hunter', 'good', ['shootOnDeath']),
      player(3, 'hunter', 'good', ['shootOnDeath']),
      player(4, 'villager', 'good', []),
    ];
    state.rounds[0].night.wolfTarget = 2;
    const match = { id: 'm-chained-hunters', config: { players: state.players }, createdAt: 'now' };
    const step = { id: 'night_resolve_1', type: 'werewolf.night_resolve', config: { day: 1, phase: 'night' } };
    const handler = createNightResolveHandler();

    const firstWords = handler.execute({ match, step, state } as never);
    const first = completeLastWordsWindow(handler, match, step, firstWords, tasks);
    tasks.push(...((first.tasks as Array<Record<string, unknown>> | undefined) || []));
    const firstHunterTaskIndex = tasks.findIndex((task) => task.action === 'hunter_shot:2');
    assert.equal(tasks[firstHunterTaskIndex].action, 'hunter_shot:2');
    assert.equal(first.state?.currentActionWindow?.actionType, 'hunter_shot');
    assert.equal(first.state?.currentActionWindow?.epochActionType, 'hunter_shot:2');
    assert.equal(epochs.some((epoch) => epoch.actionType === 'hunter_shot:2'), true);
    tasks[firstHunterTaskIndex] = {
      ...tasks[firstHunterTaskIndex],
      status: 'succeeded',
      result: { payload: { target: 3 } },
    };

    const secondWords = handler.execute({ match, step, state: first.state } as never);
    const second = completeLastWordsWindow(handler, match, step, secondWords, tasks);
    tasks.push(...((second.tasks as Array<Record<string, unknown>> | undefined) || []));
    const secondHunterTask = tasks.find((task) => task.action === 'hunter_shot:3');
    assert.equal(second.status, 'WAITING');
    assert.equal(secondHunterTask?.playerId, 3);
    assert.equal(second.state?.currentActionWindow?.actionType, 'hunter_shot');
    assert.equal(second.state?.currentActionWindow?.epochActionType, 'hunter_shot:3');
    assert.equal(epochs.some((epoch) => epoch.actionType === 'hunter_shot:3'), true);
  } finally {
    patchRepo(repo, original);
  }
});

test('multiple last words keep distinct workflow idempotency keys', () => {
  const original = snapshotRepo(repo);
  const tasks: Array<Record<string, unknown>> = [];
  try {
    patchRepo(repo, {
      upsertActionWindowEpoch: (epoch: never) => epoch,
      listEvents: () => [],
      createAiTask: (task: never) => { tasks.push({ ...task, status: task.status || 'queued', result: null }); },
      listPendingActions: () => [],
      listAiTasks: () => tasks as never,
      createWorkflowEffect: (effect: never) => effect,
    });
    const state = createState();
    state.players = [
      player(1, 'werewolf', 'wolves', ['kill']),
      player(2, 'villager', 'good', []),
      player(3, 'seer', 'good', ['inspectFaction']),
      player(4, 'villager', 'good', []),
    ];
    state.rounds[0].night.wolfTarget = 2;
    state.rounds[0].night.witchPoisonTarget = 3;
    const match = { id: 'm-last-words-keys', config: { players: state.players }, createdAt: 'now' };
    const step = { id: 'night_resolve_1', type: 'werewolf.night_resolve', config: { day: 1, phase: 'night' } };
    const handler = createNightResolveHandler();

    const waiting = handler.execute({ match, step, state } as never);
    const completed = completeLastWordsWindow(handler, match, step, waiting, tasks);
    const wordEvents = (completed.events as Array<Record<string, unknown>>)
      .filter((event) => event.type === 'werewolf_last_words');
    assert.equal(wordEvents.length, 2);
    assert.equal(new Set(wordEvents.map((event) => event.idempotencyKey)).size, 2);
  } finally {
    patchRepo(repo, original);
  }
});

test('exile result is not republished while last words are waiting', async () => {
  const original = snapshotRepo(repo);
  const tasks: Array<Record<string, unknown>> = [];
  const delivered: Array<Record<string, unknown>> = [];
  const matchId = 'm-exile-idempotency';
  const eventBus = createEventBusWithDefaults();
  const unsubscribe = eventBus.subscribeAll((event) => delivered.push(event as unknown as Record<string, unknown>));
  registerMatchInfra(matchId, eventBus, createGameEventBuilder(matchId));
  try {
    patchRepo(repo, {
      upsertActionWindowEpoch: (epoch: never) => epoch,
      listEvents: () => [],
      createAiTask: (task: never) => { tasks.push({ ...task, status: task.status || 'queued', result: null }); },
      listPendingActions: () => [],
      listAiTasks: () => tasks as never,
      createWorkflowEffect: (effect: never) => effect,
    });
    const state = createState();
    state.players = [
      player(1, 'werewolf', 'wolves', ['kill']),
      player(2, 'villager', 'good', []),
      player(3, 'seer', 'good', ['inspectFaction']),
    ];
    state.rounds[0].phase = 'day';
    state.rounds[0].votes = { 1: 2, 3: 2 };
    const match = { id: matchId, config: { players: state.players }, createdAt: 'now' };
    const step = { id: 'exile_resolve_1', type: 'werewolf.exile_resolve', config: { day: 1, phase: 'day' } };
    const handler = createExileResolveHandler();

    const waiting = handler.execute({ match, step, state } as never);
    handler.execute({ match, step, state: waiting.state } as never);
    await flushMatchEventPublishes(matchId);
    assert.equal(delivered.filter((event) => event.type === 'vote-result').length, 1);
  } finally {
    unsubscribe();
    unregisterMatchInfra(matchId);
    patchRepo(repo, original);
  }
});

test('first-night result is published once before public last words', async () => {
  const original = snapshotRepo(repo);
  const tasks: Array<Record<string, unknown>> = [];
  const delivered: Array<Record<string, unknown>> = [];
  const matchId = 'm-first-night-order';
  const eventBus = createEventBusWithDefaults();
  const unsubscribe = eventBus.subscribeAll((event) => delivered.push(event as unknown as Record<string, unknown>));
  registerMatchInfra(matchId, eventBus, createGameEventBuilder(matchId));
  try {
    patchRepo(repo, {
      upsertActionWindowEpoch: (epoch: never) => epoch,
      listEvents: () => [],
      createAiTask: (task: never) => { tasks.push({ ...task, status: task.status || 'queued', result: null }); },
      listPendingActions: () => [],
      listAiTasks: () => tasks as never,
      createWorkflowEffect: (effect: never) => effect,
    });
    const state = createState();
    state.players = [
      player(1, 'werewolf', 'wolves', ['kill']),
      player(2, 'villager', 'good', []),
      player(3, 'seer', 'good', ['inspectFaction']),
    ];
    state.rounds[0].night.wolfTarget = 2;
    const match = { id: matchId, config: { players: state.players }, createdAt: 'now' };
    const step = { id: 'night_resolve_1', type: 'werewolf.night_resolve', config: { day: 1, phase: 'night' } };
    const handler = createNightResolveHandler();

    const waiting = handler.execute({ match, step, state } as never);
    completeLastWordsWindow(handler, match, step, waiting, tasks);
    await flushMatchEventPublishes(matchId);

    const nightResultIndexes = delivered
      .map((event, index) => event.type === 'night-result' ? index : -1)
      .filter((index) => index >= 0);
    const lastWordsIndex = delivered.findIndex((event) => event.type === 'last-words');
    assert.deepEqual(nightResultIndexes.length, 1);
    assert.ok(nightResultIndexes[0] < lastWordsIndex);
  } finally {
    unsubscribe();
    unregisterMatchInfra(matchId);
    patchRepo(repo, original);
  }
});

test('death resolution checkpoint stays out of serialized game state', () => {
  const state = createState();
  state.rounds[0].deathResolution = {
    stepId: 'night_resolve_1',
    source: 'night',
    initialEffectsApplied: true,
  };
  const serialized = serializeWerewolfState(
    { id: 'm-checkpoint-hidden', config: { players: state.players }, createdAt: 'now' },
    state,
  );
  assert.equal((serialized.rounds[0] as Record<string, unknown>).deathResolution, undefined);
});

test('wolf speech window opens all wolves but queues speakers in leader order before vote', () => {
  const original = snapshotRepo(repo);
  const tasks: Array<Record<string, unknown>> = [];
  try {
    patchRepo(repo, {
      upsertActionWindowEpoch: (epoch: never) => epoch,
      listEvents: () => [],
      createAiTask: (task: never) => { tasks.push({ ...task, status: task.status || 'queued', result: null }); },
      listPendingActions: () => [],
      listAiTasks: () => tasks as never,
      createWorkflowEffect: (effect: never) => effect
    });

    const state = createState();
    state.players = [
      player(1, 'werewolf', 'wolves', ['kill']),
      player(2, 'white_wolf_king', 'wolves', ['kill'], { roleLabel: '白狼王', wolfLeaderPriority: 100, roleConfig: { id: 'white_wolf_king', name: '白狼王', faction: 'wolves', rule: { actions: [{ action: 'kill' }], wolfLeaderPriority: 100 } } }),
      player(3, 'werewolf', 'wolves', ['kill']),
      player(4, 'villager', 'good', [])
    ];
    state.rounds[0].night.wolfLeaderId = 2;
    const match = { id: 'm-wolf-order', config: { players: state.players }, createdAt: 'now' };
    const handler = createActionWindowHandler();
    const speechStep = { id: 'wolf_speech_1', type: 'werewolf.action_window', config: { day: 1, phase: 'night', actionType: 'wolf_speech', ordered: true } };

    const opened = handler.execute({ match, step: speechStep, state } as never);
    assert.equal(opened.status, 'WAITING');
    assert.deepEqual(opened.state?.rounds[0].night.wolfSpeechOrder, [2, 3, 1]);
    assert.deepEqual(opened.events?.[0].payload.actionWindow.actorIds.sort(), [1, 2, 3]);
    assert.equal(opened.tasks?.length, 1);
    assert.equal(opened.tasks?.[0].playerId, 2);
    tasks.push(...(opened.tasks || []));

    tasks[0] = { ...tasks[0], status: 'succeeded', playerId: 2, result: { payload: { speech: '先打4。' } } };
    const waiting = handler.execute({ match, step: speechStep, state: opened.state } as never);
    assert.equal(waiting.status, 'WAITING');
    assert.equal(waiting.state?.rounds[0].night.wolfSpeeches[0].text, '先打4。');
    assert.equal(waiting.tasks?.[0].playerId, 3);
    assert.equal(waiting.blockers?.[0].taskId, waiting.tasks?.[0].id);
  } finally {
    patchRepo(repo, original);
  }
});

test('ordered day speech records public chain and stops on wolf self destruct', () => {
  const original = snapshotRepo(repo);
  const tasks: Array<Record<string, unknown>> = [];
  try {
    patchRepo(repo, {
      upsertActionWindowEpoch: (epoch: never) => epoch,
      listEvents: () => [],
      createAiTask: (task: never) => { tasks.push({ ...task, status: task.status || 'queued', result: null }); },
      listPendingActions: () => [],
      listAiTasks: () => tasks as never,
      createWorkflowEffect: (effect: never) => effect
    });

    const state = createState();
    state.players = [
      player(1, 'villager', 'good', []),
      player(2, 'werewolf', 'wolves', ['kill']),
      player(3, 'villager', 'good', [])
    ];
    const match = { id: 'm-day-chain', config: { players: state.players }, createdAt: 'now' };
    const handler = createActionWindowHandler();
    const step = { id: 'day_speech_1', type: 'werewolf.action_window', config: { day: 1, phase: 'day', actionType: 'day_speech', ordered: true } };

    const opened = handler.execute({ match, step, state } as never);
    assert.equal(opened.status, 'WAITING');
    // 优先级 C（随机起始）：不依赖特定顺序，仅验证第一个发言者是存活玩家
    const firstPlayerId = opened.tasks?.[0].playerId;
    assert.ok([1, 2, 3].includes(Number(firstPlayerId)), `unexpected first speaker: ${firstPlayerId}`);
    tasks.push(...(opened.tasks || []));

    tasks[0] = { ...tasks[0], status: 'succeeded', playerId: firstPlayerId, result: { payload: { text: '我站边预言家。' } } };
    const waiting = handler.execute({ match, step, state: opened.state } as never);
    assert.equal(waiting.status, 'WAITING');
    assert.equal(waiting.state?.rounds[0].speeches[0].text, '我站边预言家。');
    const secondPlayerId = waiting.tasks?.[0].playerId;
    assert.ok(secondPlayerId !== firstPlayerId, 'second speaker should differ from first');
    tasks.push(...(waiting.tasks || []));

    tasks[1] = {
      ...tasks[1],
      status: 'succeeded',
      playerId: secondPlayerId,
      result: { payload: { text: '我不装了。', selfDestruct: true, selfDestructText: `${secondPlayerId}号狼人自爆。` } }
    };
    const completed = handler.execute({ match, step, state: waiting.state } as never);
    assert.equal(completed.status, 'COMPLETED');
    assert.equal(completed.state?.rounds[0].selfDestruct.playerId, Number(secondPlayerId));
    assert.equal(completed.state?.players.find((item: Record<string, unknown>) => Number(item.id) === Number(secondPlayerId)).alive, false);
    assert.equal(completed.events?.[0].type, 'werewolf_self_destruct');
  } finally {
    patchRepo(repo, original);
  }
});

test('human pending action submission lets werewolf action window continue', () => {
  const original = snapshotRepo(repo);
  const pendingActions: Array<Record<string, unknown>> = [];
  try {
    patchRepo(repo, {
      upsertActionWindowEpoch: (epoch: never) => epoch,
      listEvents: () => [],
      createAiTask: () => undefined,
      listAiTasks: () => [],
      listPendingActions: () => pendingActions as never,
      createWorkflowEffect: (effect: never) => effect
    });

    const state = createState();
    state.players = [
      { ...state.players![0], actorType: 'human', faction: 'good', canVote: true },
      { ...state.players![1], actorType: 'human', alive: true, canVote: true },
      { ...state.players![2], actorType: 'human', alive: true, canVote: true }
    ];
    const match = { id: 'm-human', config: { players: state.players }, createdAt: 'now' };
    const step = { id: 'day_vote_1', type: 'werewolf.action_window', config: { day: 1, phase: 'day', actionType: 'day_vote' } };
    const handler = createActionWindowHandler();

    const opened = handler.execute({ match, step, state } as never);
    assert.equal(opened.status, 'WAITING');
    assert.equal(opened.pendingActions?.length, 3);
    pendingActions.push(...(opened.pendingActions || []).map((action: Record<string, unknown>) => ({
      ...action,
      status: Number(action.playerId) === 1 ? 'submitted' : 'pending',
      payload: Number(action.playerId) === 1 ? { target: 2 } : action.payload
    })));

    let waiting = handler.execute({ match, step, state: opened.state } as never);
    assert.equal(waiting.status, 'WAITING');
    pendingActions.forEach((action) => {
      action.status = 'submitted';
      action.payload = { target: Number(action.playerId) === 3 ? null : 2 };
    });

    const completed = handler.execute({ match, step, state: waiting.state } as never);
    assert.equal(completed.status, 'COMPLETED');
    assert.equal(completed.state?.rounds[0].votes[1], 2);
    assert.equal(completed.state?.rounds[0].votes[3], null);
    assert.equal(completed.events?.[0].type, 'werewolf_action_submitted');
  } finally {
    patchRepo(repo, original);
  }
});

test('dead player stale pending vote is ignored and cannot satisfy the action window', () => {
  const original = snapshotRepo(repo);
  const pendingActions: Array<Record<string, unknown>> = [];
  try {
    patchRepo(repo, {
      upsertActionWindowEpoch: (epoch: never) => epoch,
      listEvents: () => [],
      createAiTask: () => undefined,
      listAiTasks: () => [],
      listPendingActions: () => pendingActions as never,
      createWorkflowEffect: (effect: never) => effect
    });

    const state = createState();
    state.players = state.players!.map((player: Record<string, unknown>) => ({
      ...player,
      actorType: 'human',
      alive: true,
      canVote: true,
    }));
    const match = { id: 'm-dead-voter', config: { players: state.players }, createdAt: 'now' };
    const step = { id: 'day_vote_1', type: 'werewolf.action_window', config: { day: 1, phase: 'day', actionType: 'day_vote' } };
    const handler = createActionWindowHandler();

    const opened = handler.execute({ match, step, state } as never);
    pendingActions.push(...(opened.pendingActions || []).map((action: Record<string, unknown>) => ({
      ...action,
      status: 'submitted',
      payload: { target: 2 },
    })));

    const deadPlayerId = Number(pendingActions[0].playerId);
    const resumedState = {
      ...opened.state,
      players: opened.state.players!.map((player: Record<string, unknown>) => (
        Number(player.id) === deadPlayerId ? { ...player, alive: false, canVote: false } : player
      )),
    };

    const completed = handler.execute({ match, step, state: resumedState } as never);
    assert.equal(completed.status, 'COMPLETED');
    assert.equal(completed.state?.rounds[0].votes[deadPlayerId], undefined);
    assert.equal(
      Object.keys(completed.state?.rounds[0].votes || {}).length,
      resumedState.players.filter((player: Record<string, unknown>) => player.alive && player.canVote !== false).length,
    );
  } finally {
    patchRepo(repo, original);
  }
});

test('witch close eyes is emitted only after poison phase', () => {
  const original = snapshotRepo(repo);
  const tasks: Array<Record<string, unknown>> = [];
  try {
    patchRepo(repo, {
      upsertActionWindowEpoch: (epoch: never) => epoch,
      listEvents: () => [],
      createAiTask: (task: never) => { tasks.push({ ...task, status: task.status || 'queued', result: null }); },
      listPendingActions: () => [],
      listAiTasks: () => tasks as never,
      createWorkflowEffect: (effect: never) => effect
    });

    const state = createState();
    state.players = [
      player(1, 'werewolf', 'wolves', ['kill']),
      player(2, 'witch', 'good', ['save', 'poison']),
      player(3, 'villager', 'good', [])
    ];
    state.rounds[0].night.wolfTarget = 3;
    const match = { id: 'm-witch-close', config: { players: state.players }, createdAt: 'now' };
    const handler = createActionWindowHandler();

    const saveStep = { id: 'witch_save_1', type: 'werewolf.action_window', config: { day: 1, phase: 'night', actionType: 'witch_save', optional: true } };
    const saveOpened = handler.execute({ match, step: saveStep, state } as never);
    tasks.push(...(saveOpened.tasks || []));
    tasks[0] = { ...tasks[0], status: 'succeeded', playerId: 2, result: { payload: { use: false } } };
    const saveCompleted = handler.execute({ match, step: saveStep, state: saveOpened.state } as never);
    assert.equal(saveCompleted.status, 'COMPLETED');
    assert.equal((saveCompleted.events || []).filter((event: Record<string, unknown>) => event.type === 'werewolf_phase_end').length, 0);

    const poisonStep = { id: 'witch_poison_1', type: 'werewolf.action_window', config: { day: 1, phase: 'night', actionType: 'witch_poison', optional: true } };
    const poisonOpened = handler.execute({ match, step: poisonStep, state: saveCompleted.state } as never);
    tasks.push(...(poisonOpened.tasks || []));
    tasks[1] = { ...tasks[1], status: 'succeeded', playerId: 2, result: { payload: { use: false, target: null } } };
    const poisonCompleted = handler.execute({ match, step: poisonStep, state: poisonOpened.state } as never);
    const closeEvents = (poisonCompleted.events || []).filter((event: Record<string, unknown>) => event.type === 'werewolf_phase_end');
    assert.equal(closeEvents.length, 1);
    assert.equal((closeEvents[0] as Record<string, unknown>).payload.message, '女巫请闭眼。');
  } finally {
    patchRepo(repo, original);
  }
});

test('depleted antidote skips privately while remaining poison still opens', () => {
  const original = snapshotRepo(repo);
  const tasks: Array<Record<string, unknown>> = [];
  try {
    patchRepo(repo, {
      upsertActionWindowEpoch: (epoch: never) => epoch,
      listEvents: () => [],
      createAiTask: (task: never) => { tasks.push({ ...task, status: task.status || 'queued', result: null }); },
      listPendingActions: () => [],
      listAiTasks: () => tasks as never,
      createWorkflowEffect: (effect: never) => effect,
    });

    const state = createState();
    state.players = [
      player(1, 'werewolf', 'wolves', ['kill']),
      player(2, 'witch', 'good', ['save', 'poison'], { usedAntidote: true, usedPoison: false }),
      player(3, 'villager', 'good', []),
    ];
    state.rounds[0].night.wolfTarget = 3;
    const match = { id: 'm-witch-antidote-depleted', config: { players: state.players }, createdAt: 'now' };
    const handler = createActionWindowHandler();

    const saveResult = handler.execute({
      match,
      step: { id: 'witch_save_1', type: 'werewolf.action_window', config: { day: 1, phase: 'night', actionType: 'witch_save', optional: true } },
      state,
    } as never);
    assert.equal(saveResult.status, 'COMPLETED');
    assert.equal(saveResult.events?.length, 1);
    assert.equal(saveResult.events?.[0].channel, 'system');
    assert.equal(saveResult.events?.[0].visibility, 'system');
    assert.equal(saveResult.events?.[0].payload.skipReason, 'antidote_depleted');
    assert.equal(tasks.length, 0);

    const poisonResult = handler.execute({
      match,
      step: { id: 'witch_poison_1', type: 'werewolf.action_window', config: { day: 1, phase: 'night', actionType: 'witch_poison', optional: true } },
      state: saveResult.state,
    } as never);
    assert.equal(poisonResult.status, 'WAITING');
    assert.equal(poisonResult.tasks?.length, 1);
  } finally {
    patchRepo(repo, original);
  }
});

test('using antidote always skips poison without creating work', () => {
  const original = snapshotRepo(repo);
  const tasks: Array<Record<string, unknown>> = [];
  const epochs: Array<Record<string, unknown>> = [];
  try {
    patchRepo(repo, {
      upsertActionWindowEpoch: (epoch: never) => {
        epochs.push({ ...epoch });
        return epoch;
      },
      listEvents: () => [],
      createAiTask: (task: never) => { tasks.push({ ...task, status: task.status || 'queued', result: null }); },
      listPendingActions: () => [],
      listAiTasks: () => tasks as never,
      createWorkflowEffect: (effect: never) => effect,
    });

    const state = createState();
    state.players = [
      player(1, 'werewolf', 'wolves', ['kill']),
      player(2, 'witch', 'good', ['save', 'poison']),
      player(3, 'villager', 'good', []),
    ];
    state.rounds[0].night.wolfTarget = 3;
    state.rounds[0].night.witchSave = true;
    state.rounds[0].night.witchSaveTarget = 3;
    const handler = createActionWindowHandler();
    const result = handler.execute({
      match: { id: 'm-witch-one-potion', config: { players: state.players }, createdAt: 'now' },
      step: {
        id: 'witch_poison_1',
        type: 'werewolf.action_window',
        config: { day: 1, phase: 'night', actionType: 'witch_poison', optional: true },
      },
      state,
    } as never);

    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.tasks?.length || 0, 0);
    assert.equal(result.pendingActions?.length || 0, 0);
    assert.equal(tasks.length, 0);
    assert.equal(epochs.length, 0);
    assert.equal(result.events?.[0].payload.skipReason, 'one_potion_per_night');
    assert.equal(result.events?.[0].channel, 'system');
  } finally {
    patchRepo(repo, original);
  }
});

test('witch stages silently skip when both potions are depleted or witch is dead', () => {
  for (const patch of [
    { usedAntidote: true, usedPoison: true },
    { usedAntidote: false, usedPoison: false, alive: false },
  ]) {
    const state = createState();
    state.players = [
      player(1, 'werewolf', 'wolves', ['kill']),
      player(2, 'witch', 'good', ['save', 'poison'], patch),
      player(3, 'villager', 'good', []),
    ];
    state.rounds[0].night.wolfTarget = 3;
    const match = { id: `m-witch-silent-${patch.alive === false ? 'dead' : 'empty'}`, config: { players: state.players }, createdAt: 'now' };
    const handler = createActionWindowHandler();

    let current = state;
    for (const actionType of ['witch_save', 'witch_poison']) {
      const result = handler.execute({
        match,
        step: { id: `${actionType}_1`, type: 'werewolf.action_window', config: { day: 1, phase: 'night', actionType, optional: true } },
        state: current,
      } as never);
      assert.equal(result.status, 'COMPLETED');
      assert.equal(result.events?.length, 1);
      assert.equal(result.events?.[0].channel, 'system');
      assert.equal(result.events?.[0].visibility, 'system');
      current = result.state as Record<string, unknown>;
    }
  }
});

test('peaceful night skips antidote privately but keeps poison available', () => {
  const original = snapshotRepo(repo);
  const tasks: Array<Record<string, unknown>> = [];
  try {
    patchRepo(repo, {
      upsertActionWindowEpoch: (epoch: never) => epoch,
      listEvents: () => [],
      createAiTask: (task: never) => { tasks.push({ ...task, status: task.status || 'queued', result: null }); },
      listPendingActions: () => [],
      listAiTasks: () => tasks as never,
      createWorkflowEffect: (effect: never) => effect,
    });
    const state = createState();
    state.players = [
      player(1, 'werewolf', 'wolves', ['kill']),
      player(2, 'witch', 'good', ['save', 'poison']),
      player(3, 'villager', 'good', []),
    ];
    const match = { id: 'm-witch-peaceful', config: { players: state.players }, createdAt: 'now' };
    const handler = createActionWindowHandler();

    const saveResult = handler.execute({
      match,
      step: { id: 'witch_save_1', type: 'werewolf.action_window', config: { day: 1, phase: 'night', actionType: 'witch_save', optional: true } },
      state,
    } as never);
    assert.equal(saveResult.events?.[0].payload.skipReason, 'no_wolf_target');
    assert.equal(saveResult.events?.[0].channel, 'system');

    const poisonResult = handler.execute({
      match,
      step: { id: 'witch_poison_1', type: 'werewolf.action_window', config: { day: 1, phase: 'night', actionType: 'witch_poison', optional: true } },
      state: saveResult.state,
    } as never);
    assert.equal(poisonResult.status, 'WAITING');
    assert.equal(poisonResult.tasks?.length, 1);
  } finally {
    patchRepo(repo, original);
  }
});

test('private night action phase results are scoped and not public', () => {
  const cases = [
    {
      actionType: 'seer_check',
      actor: player(4, 'seer', 'good', ['inspectFaction']),
      payload: { target: 2, result: '好人', reason: '验证中置位' },
      scopeKey: 'seer',
    },
    {
      actionType: 'guard_protect',
      actor: player(5, 'guard', 'good', ['guard']),
      payload: { target: 2, reason: '保护关键位' },
      scopeKey: 'guard',
    },
    {
      actionType: 'witch_save',
      actor: player(6, 'witch', 'good', ['save', 'poison']),
      payload: { use: true, target: 2, reason: '救关键位' },
      scopeKey: 'witch',
      wolfTarget: 2,
    },
    {
      actionType: 'witch_poison',
      actor: player(6, 'witch', 'good', ['save', 'poison']),
      payload: { use: true, target: 2, reason: '怀疑是狼' },
      scopeKey: 'witch',
    },
  ];

  for (const item of cases) {
    const original = snapshotRepo(repo);
    const tasks: Array<Record<string, unknown>> = [];
    try {
      patchRepo(repo, {
        upsertActionWindowEpoch: (epoch: never) => epoch,
        listEvents: () => [],
        createAiTask: (task: never) => { tasks.push({ ...task, status: task.status || 'queued', result: null }); },
        listPendingActions: () => [],
        listAiTasks: () => tasks as never,
        createWorkflowEffect: (effect: never) => effect
      });

      const state = createState();
      state.players = [...(state.players as Record<string, unknown>[]), item.actor];
      if (item.wolfTarget) state.rounds[0].night.wolfTarget = item.wolfTarget;
      const match = { id: `m-private-${item.actionType}`, config: { players: state.players }, createdAt: 'now' };
      const handler = createActionWindowHandler();
      const step = { id: `${item.actionType}_1`, type: 'werewolf.action_window', config: { day: 1, phase: 'night', actionType: item.actionType } };

      const opened = handler.execute({ match, step, state } as never);
      assert.equal(opened.status, 'WAITING');
      assert.equal(opened.events?.[0].channel, 'scope');
      tasks.push(...(opened.tasks || []));
      tasks[0] = {
        ...tasks[0],
        status: 'succeeded',
        playerId: item.actor.id,
        result: { payload: item.payload }
      };

      const completed = handler.execute({ match, step, state: opened.state } as never);
      assert.equal(completed.status, 'COMPLETED');
      const submittedEvent = (completed.events || []).find((event: Record<string, unknown>) => event.type === 'werewolf_action_submitted') as Record<string, unknown> | undefined;
      assert.equal(submittedEvent?.channel, 'scope', item.actionType);
      assert.equal(submittedEvent?.scopeKey, item.scopeKey, item.actionType);
      const resultEvent = (completed.events || []).find((event: Record<string, unknown>) => event.type === 'werewolf_phase_result') as Record<string, unknown> | undefined;
      if (resultEvent) {
        assert.equal(resultEvent.channel, 'scope', item.actionType);
        assert.equal(resultEvent.scopeKey, item.scopeKey, item.actionType);
        assert.equal((resultEvent.payload as Record<string, unknown> | undefined)?.channel, 'scope', item.actionType);
        assert.equal((resultEvent.payload as Record<string, unknown> | undefined)?.scopeKey, item.scopeKey, item.actionType);
        assert.match(String((resultEvent.payload as Record<string, unknown> | undefined)?.message || ''), /。/);
      }
      const auditEvent = (completed.events || []).find((event: Record<string, unknown>) => event.type === 'werewolf_action_engine_shadow_audited') as Record<string, unknown> | undefined;
      assert.equal(auditEvent?.channel, 'system', item.actionType);
      assert.equal(auditEvent?.visibility, 'system', item.actionType);
      const auditPayload = auditEvent?.payload as Record<string, unknown> | undefined;
      assert.equal(auditPayload?.status, 'matched', `${item.actionType}: ${JSON.stringify(auditPayload)}`);
    } finally {
      patchRepo(repo, original);
    }
  }
});

test('seer check result is injected dynamically without extending seer message history', () => {
  const state = createState();
  state.players = [
    ...(state.players as Record<string, unknown>[]),
    {
      ...player(4, 'seer', 'good', ['inspectFaction']),
      seerChecks: [{ day: 1, target: 2, result: '好人' }],
    },
  ];
  state.rounds[0].night.seerCheck = { target: 2, result: '好人' };
  const match = { id: 'm-seer-memory', config: { players: state.players }, state, createdAt: 'now' };

  const runtime = createRuntime(match as never);
  const seer = runtime.agents.find((agent: Record<string, unknown>) => Number(agent.id) === 4) as Record<string, unknown> | undefined;
  const messages = (seer?.playerAgent as { messages?: Array<{ content: string }> } | undefined)?.messages || [];
  const prompt = buildWerewolfActionPrompt({
    runtime: runtime as never,
    round: state.rounds[0] as never,
    actor: seer as never,
    actionType: 'seer_check',
  });

  assert.equal(messages.length, 1);
  assert.doesNotMatch(messages[0]?.content || '', /预言家私密查验结果/);
  assert.match(prompt, /【你的私密信息】/);
  assert.match(prompt, /预言家查验记录：第1晚查验2号，结果：好人。/);
});

test('wolf private prompt lists teammates with live and eliminated status', () => {
  const state = createState();
  state.players = [
    player(1, 'werewolf', 'wolves', ['kill']),
    player(2, 'werewolf', 'wolves', ['kill']),
    player(3, 'werewolf', 'wolves', ['kill'], { alive: false, deathDay: 1, deathReason: '放逐' }),
  ];
  const match = { id: 'm-wolf-team-memory', config: { players: state.players }, state, createdAt: 'now' };

  const runtime = createRuntime(match as never);
  const wolf = runtime.agents.find((agent: Record<string, unknown>) => Number(agent.id) === 1) as Record<string, unknown> | undefined;
  const messages = ((wolf?.playerAgent as { messages?: Array<{ content: string }> } | undefined)?.messages || []);
  const openingSystem = messages[0]?.content || '';
  const openingPrompt = String(wolf?.baseSystemPrompt || '');

  assert.equal(openingSystem, openingPrompt);
  assert.match(openingSystem, /本局你是 1 号/);
  assert.match(openingSystem, /狼队私密信息/);
  assert.match(openingPrompt, /狼队私密信息/);
  assert.match(openingPrompt, /2号（[^）]*存活）/);
  assert.match(openingPrompt, /3号（[^）]*已出局）/);
});

test('seer check phase result is published to EventBus as scoped seer feedback', async () => {
  const original = snapshotRepo(repo);
  const tasks: Array<Record<string, unknown>> = [];
  const delivered: Array<Record<string, unknown>> = [];
  const matchId = 'm-seer-eventbus';
  const eventBus = createEventBusWithDefaults();
  const gameEventBuilder = createGameEventBuilder(matchId);
  const unsubscribe = eventBus.subscribeAll((event) => {
    delivered.push(event as unknown as Record<string, unknown>);
  });
  registerMatchInfra(matchId, eventBus, gameEventBuilder);
  try {
    patchRepo(repo, {
      upsertActionWindowEpoch: (epoch: never) => epoch,
      listEvents: () => [],
      createAiTask: (task: never) => { tasks.push({ ...task, status: task.status || 'queued', result: null }); },
      listPendingActions: () => [],
      listAiTasks: () => tasks as never,
      createWorkflowEffect: (effect: never) => effect
    });

    const state = createState();
    state.players = [
      player(1, 'werewolf', 'wolves', ['kill']),
      player(2, 'villager', 'good', []),
      player(4, 'seer', 'good', ['inspectFaction']),
    ];
    const match = { id: matchId, config: { players: state.players }, createdAt: 'now' };
    const handler = createActionWindowHandler();
    const step = { id: 'seer_check_1', type: 'werewolf.action_window', config: { day: 1, phase: 'night', actionType: 'seer_check' } };

    const opened = handler.execute({ match, step, state } as never);
    tasks.push(...(opened.tasks || []));
    tasks[0] = {
      ...tasks[0],
      status: 'succeeded',
      playerId: 4,
      result: { payload: { target: 2, result: '好人', reason: '验证中置位' } }
    };

    const completed = handler.execute({ match, step, state: opened.state } as never);
    assert.equal(completed.status, 'COMPLETED');
    await flushMatchEventPublishes(matchId);

    const seerEvent = delivered.find((event) => event.type === 'seer-check');
    assert.equal(seerEvent?.channel, 'scope');
    assert.equal(seerEvent?.scopeKey, 'seer');
    assert.match(String((seerEvent?.payload as Record<string, unknown> | undefined)?.message || ''), /2号玩家的身份是：好人/);
    assert.match(String((seerEvent?.payload as Record<string, unknown> | undefined)?.message || ''), /。验证中置位/);
    assert.equal(
      ((seerEvent?.payload as Record<string, unknown> | undefined)?.seerCheck as Record<string, unknown> | undefined)?.reason,
      '验证中置位',
    );
  } finally {
    unsubscribe();
    unregisterMatchInfra(matchId);
    patchRepo(repo, original);
  }
});

test('first day sheriff election windows resolve a human election', () => {
  const original = snapshotRepo(repo);
  const pendingActions: Array<Record<string, unknown>> = [];
  try {
    patchRepo(repo, {
      upsertActionWindowEpoch: (epoch: never) => epoch,
      listEvents: () => [],
      createAiTask: () => undefined,
      listAiTasks: () => [],
      listPendingActions: () => pendingActions as never,
      createWorkflowEffect: (effect: never) => effect
    });

    const state = createState();
    state.players = state.players!.map((player: Record<string, unknown>) => ({ ...player, actorType: 'human', alive: true, canVote: true }));
    const match = { id: 'm-sheriff', config: { players: state.players }, createdAt: 'now' };
    const handler = createActionWindowHandler();

    let current = openAndSubmit(handler, match, state, 'sheriff_signup_1', 'sheriff_signup', {
      1: { run: true },
      2: { run: true },
      3: { run: false }
    }, pendingActions);
    assert.deepEqual(current.rounds[0].sheriffElection.signedUpIds, [1, 2]);

    current = openAndSubmit(handler, match, current, 'sheriff_speech_1', 'sheriff_speech', {
      1: { text: '我竞选警长。' },
      2: { text: '我也竞选。' }
    }, pendingActions);
    assert.equal(current.rounds[0].sheriffElection.speeches.length, 2);

    current = openAndSubmit(handler, match, current, 'sheriff_withdraw_1', 'sheriff_withdraw', {
      1: { withdraw: false },
      2: { withdraw: true }
    }, pendingActions);
    assert.deepEqual(current.rounds[0].sheriffElection.candidates, [1]);

    current = openAndSubmit(handler, match, current, 'sheriff_vote_1', 'sheriff_vote', {
      2: { target: 1 },
      3: { target: 1 }
    }, pendingActions);
    assert.deepEqual(current.rounds[0].sheriffElection.voters, [3]);
    assert.deepEqual(current.rounds[0].sheriffElection.tally, { 1: 1 });

    const resolved = createSheriffResolveHandler().execute({
      match,
      step: { id: 'sheriff_resolve_1', type: 'werewolf.sheriff_resolve', config: { day: 1, phase: 'day', actionType: 'sheriff_resolve' } },
      state: current
    } as never);
    assert.equal(resolved.status, 'COMPLETED');
    assert.equal(resolved.state?.rounds[0].sheriffId, 1);
    assert.equal(resolved.state?.rounds[0].sheriffBadge.status, 'held');
  } finally {
    patchRepo(repo, original);
  }
});

function createState(): Record<string, unknown> {
  const round = createRound(1);
  return {
    modeConfig: { sheriff: {}, witch: {}, roleMap: {} },
    werewolfMode: { id: 'fake', name: 'Fake' },
    host: { id: 0, name: 'host' },
    players: [
      player(1, 'werewolf', 'wolves', ['kill']),
      player(2, 'villager', 'good', []),
      player(3, 'villager', 'good', [])
    ],
    rounds: [round],
    completedSteps: {},
    winner: null,
    winReason: ''
  };
}

function completeLastWordsWindow(
  handler: { execute(input: Record<string, unknown>): Record<string, unknown> },
  match: Record<string, unknown>,
  step: Record<string, unknown>,
  initial: Record<string, unknown>,
  tasks: Array<Record<string, unknown>>,
): Record<string, unknown> {
  let result = initial;
  const collectedEvents: unknown[] = [...((initial.events as unknown[] | undefined) || [])];
  while (result.status === 'WAITING' && (result.state as Record<string, unknown>)?.currentActionWindow) {
    const window = (result.state as { currentActionWindow?: { actionType?: string } }).currentActionWindow;
    if (window?.actionType !== 'last_words') return result;
    tasks.push(...((result.tasks as Array<Record<string, unknown>> | undefined) || []));
    for (let index = 0; index < tasks.length; index += 1) {
      if (!String(tasks[index].action || '').startsWith('last_words') || tasks[index].status === 'succeeded') continue;
      tasks[index] = {
        ...tasks[index],
        status: 'succeeded',
        result: { payload: { text: `${tasks[index].playerId}号遗言`, thinking: '' } },
      };
    }
    result = handler.execute({ match, step, state: result.state });
    collectedEvents.push(...((result.events as unknown[] | undefined) || []));
  }
  if (result.status === 'WAITING') {
    throw new Error(`last words window did not complete: ${JSON.stringify({
      window: (result.state as { currentActionWindow?: unknown })?.currentActionWindow,
      tasks: tasks.map((task) => ({ action: task.action, playerId: task.playerId, status: task.status })),
    })}`);
  }
  return { ...result, events: collectedEvents };
}

function player(id: number, role: string, faction: string, actions: string[], patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    name: String(id),
    nickname: String(id),
    role,
    roleLabel: role,
    faction,
    alive: true,
    canVote: true,
    votes: [],
    seerChecks: [],
    roleConfig: { id: role, name: role, faction, rule: { actions: actions.map((action) => ({ action })) } },
    ...patch
  };
}

function openAndSubmit(
  handler: ReturnType<typeof createActionWindowHandler>,
  match: Record<string, unknown>,
  state: Record<string, unknown>,
  stepId: string,
  actionType: string,
  payloads: Record<number, Record<string, unknown>>,
  pendingActions: Array<Record<string, unknown>>
): Record<string, unknown> {
  pendingActions.length = 0;
  const step = { id: stepId, type: 'werewolf.action_window', config: { day: 1, phase: 'day', actionType } };
  const opened = handler.execute({ match, step, state } as never);
  assert.equal(opened.status, 'WAITING');
  pendingActions.push(...(opened.pendingActions || []).map((action: Record<string, unknown>) => ({
    ...action,
    status: 'submitted',
    payload: payloads[Number(action.playerId)] || {}
  })));
  const completed = handler.execute({ match, step, state: opened.state } as never);
  assert.equal(completed.status, 'COMPLETED');
  return completed.state as Record<string, unknown>;
}

function snapshotRepo(target: typeof repo): RepoPatch {
  return {
    upsertActionWindowEpoch: target.upsertActionWindowEpoch,
    listEvents: target.listEvents,
    createAiTask: target.createAiTask,
    listAiTasks: target.listAiTasks,
    listPendingActions: target.listPendingActions,
    createWorkflowEffect: target.createWorkflowEffect
  };
}

function patchRepo(target: typeof repo, patch: Partial<RepoPatch>): void {
  Object.assign(target, patch);
}
