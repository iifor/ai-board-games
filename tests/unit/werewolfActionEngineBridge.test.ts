import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDomainAction, runWerewolfActionEngineBridge } from '../../packages/server/modules/werewolf/actionEngineBridge';
import { setDbExecutorForTests } from '../../packages/server/db';
import type { DbExecutor } from '../../packages/server/db/types';

describe('Werewolf action engine bridge', { concurrency: false }, () => {
const memoryDb: DbExecutor = {
  queryOne: async () => null,
  queryMany: async () => [],
  execute: async () => ({ rowCount: 0 }),
  withTransaction: async (operation) => operation(memoryDb),
  healthCheck: async () => true,
  close: async () => {},
};

beforeEach(() => setDbExecutorForTests(memoryDb));
afterEach(() => setDbExecutorForTests(null));

test('Werewolf action engine bridge builds stable DomainAction from action result', () => {
  const action = buildDomainAction({
    match: { id: 'match-bridge' },
    step: { id: 'seer_check_1', config: { day: 1, phase: 'night', actionType: 'seer_check' } },
    state: createState(),
    actionWindow: { id: 'match-bridge:seer_check_1:seer_check' },
    results: [],
  }, {
    source: 'ai',
    actorId: 4,
    payload: { target: 2, result: '好人' },
  });

  assert.equal(action.id, 'match-bridge:seer_check_1:seer_check:4');
  assert.equal(action.matchId, 'match-bridge');
  assert.equal(action.windowId, 'match-bridge:seer_check_1:seer_check');
  assert.equal(action.actorId, 4);
  assert.equal(action.actionType, 'seer_check');
  assert.equal(action.payload.target, 2);
  assert.equal(action.idempotencyKey, action.id);
});

test('Werewolf action engine bridge projects seer check and matches legacy shadow', async () => {
  const state = createState([
    player(1, 'werewolf', 'wolves'),
    player(2, 'villager', 'good'),
    player(4, 'seer', 'good', ['inspectFaction']),
  ]);
  const result = await runWerewolfActionEngineBridge({
    match: { id: 'match-bridge', config: { players: state.players } },
    step: { id: 'seer_check_1', config: { day: 1, phase: 'night', actionType: 'seer_check' } },
    state,
    actionWindow: window('match-bridge', 'seer_check_1', 'seer_check', [4]),
    results: [{ source: 'ai', actorId: 4, payload: { target: 2, result: '好人' } }],
  });

  assert.equal(result.audit.status, 'matched');
  assert.equal(result.events[0].type, 'seer_checked');
  assert.equal(result.events[0].channel, 'scope');
  assert.equal(result.events[0].scopeKey, 'seer');
  assert.equal(result.state.rounds?.[0]?.night?.seerCheck?.target, 2);
});

test('Werewolf action engine bridge projects wolf vote tally and target', async () => {
  const state = createState([
    player(1, 'werewolf', 'wolves', ['kill']),
    player(2, 'werewolf', 'wolves', ['kill']),
    player(3, 'villager', 'good'),
    player(4, 'villager', 'good'),
  ]);
  const result = await runWerewolfActionEngineBridge({
    match: { id: 'match-bridge', config: { players: state.players } },
    step: { id: 'wolf_vote_1', config: { day: 1, phase: 'night', actionType: 'wolf_vote' } },
    state,
    actionWindow: window('match-bridge', 'wolf_vote_1', 'wolf_vote', [1, 2]),
    results: [
      { source: 'ai', actorId: 1, payload: { target: 3 } },
      { source: 'ai', actorId: 2, payload: { target: 3 } },
    ],
  });

  assert.equal(result.audit.status, 'matched');
  assert.equal(result.events.length, 2);
  assert.equal(result.events[0].type, 'wolf_target_selected');
  assert.deepEqual(result.state.rounds?.[0]?.night?.wolfChoices, { 1: 3, 2: 3 });
  assert.deepEqual(result.state.rounds?.[0]?.night?.wolfVoteTally, { 3: 2 });
  assert.equal(result.state.rounds?.[0]?.night?.wolfTarget, 3);
});

test('Werewolf action engine bridge uses wolf_kill compatibility path', async () => {
  const state = createState([
    player(1, 'werewolf', 'wolves', ['kill']),
    player(2, 'villager', 'good'),
  ]);
  const result = await runWerewolfActionEngineBridge({
    match: { id: 'match-bridge', config: { players: state.players } },
    step: { id: 'wolf_kill_1', config: { day: 1, phase: 'night', actionType: 'wolf_kill' } },
    state,
    actionWindow: window('match-bridge', 'wolf_kill_1', 'wolf_kill', [1]),
    results: [{ source: 'ai', actorId: 1, payload: { target: 2 } }],
  });

  assert.equal(result.audit.status, 'matched');
  assert.equal(result.events[0].type, 'wolf_target_selected');
  assert.equal(result.state.rounds?.[0]?.night?.wolfTarget, 2);
});

test('Werewolf action engine bridge projects guard protect state', async () => {
  const state = createState([
    player(1, 'werewolf', 'wolves', ['kill']),
    player(2, 'villager', 'good'),
    player(5, 'guard', 'good', ['guard']),
  ]);
  const result = await runWerewolfActionEngineBridge({
    match: { id: 'match-bridge', config: { players: state.players } },
    step: { id: 'guard_protect_1', config: { day: 1, phase: 'night', actionType: 'guard_protect' } },
    state,
    actionWindow: window('match-bridge', 'guard_protect_1', 'guard_protect', [5]),
    results: [{ source: 'ai', actorId: 5, payload: { target: 2 } }],
  });

  assert.equal(result.audit.status, 'matched');
  assert.equal(result.events[0].type, 'guard_protected');
  assert.equal(result.events[0].scopeKey, 'guard');
  assert.equal(result.state.rounds?.[0]?.night?.guardTarget, 2);
  assert.equal(result.state.players?.find((item: Record<string, unknown>) => Number(item.id) === 5)?.lastGuardTarget, 2);
});

test('Werewolf action engine bridge projects witch save state', async () => {
  const state = createState([
    player(1, 'werewolf', 'wolves', ['kill']),
    player(2, 'villager', 'good'),
    player(6, 'witch', 'good', ['save', 'poison']),
  ]);
  const rounds = state.rounds as Array<{ night: Record<string, unknown> }>;
  rounds[0].night.wolfTarget = 2;
  const result = await runWerewolfActionEngineBridge({
    match: { id: 'match-bridge', config: { players: state.players } },
    step: { id: 'witch_save_1', config: { day: 1, phase: 'night', actionType: 'witch_save' } },
    state,
    actionWindow: window('match-bridge', 'witch_save_1', 'witch_save', [6]),
    results: [{ source: 'ai', actorId: 6, payload: { use: true, target: 2 } }],
  });

  assert.equal(result.audit.status, 'matched');
  assert.equal(result.events[0].type, 'witch_saved');
  assert.equal(result.events[0].scopeKey, 'witch');
  assert.equal(result.state.rounds?.[0]?.night?.witchSave, true);
  assert.equal(result.state.rounds?.[0]?.night?.witchSaveTarget, 2);
});

test('Werewolf action engine bridge projects witch poison state', async () => {
  const state = createState([
    player(1, 'werewolf', 'wolves', ['kill']),
    player(2, 'villager', 'good'),
    player(6, 'witch', 'good', ['save', 'poison']),
  ]);
  const result = await runWerewolfActionEngineBridge({
    match: { id: 'match-bridge', config: { players: state.players } },
    step: { id: 'witch_poison_1', config: { day: 1, phase: 'night', actionType: 'witch_poison' } },
    state,
    actionWindow: window('match-bridge', 'witch_poison_1', 'witch_poison', [6]),
    results: [{ source: 'ai', actorId: 6, payload: { use: true, target: 2 } }],
  });

  assert.equal(result.audit.status, 'matched');
  assert.equal(result.events[0].type, 'witch_poisoned');
  assert.equal(result.events[0].scopeKey, 'witch');
  assert.equal(result.state.rounds?.[0]?.night?.witchPoisonTarget, 2);
});

test('Werewolf action engine bridge falls back to legacy on engine validation failure', async () => {
  const state = createState([
    player(4, 'seer', 'good', ['inspectFaction']),
    player(2, 'villager', 'good'),
  ]);
  const result = await runWerewolfActionEngineBridge({
    match: { id: 'match-bridge', config: { players: state.players } },
    step: { id: 'seer_check_1', config: { day: 1, phase: 'night', actionType: 'seer_check' } },
    state,
    actionWindow: window('match-bridge', 'seer_check_1', 'seer_check', [4]),
    results: [{ source: 'ai', actorId: 4, payload: { result: '好人' } }],
  });

  assert.equal(result.usedFallback, true);
  assert.equal(result.audit.status, 'audit_failed');
  assert.equal(result.events.length, 0);
});

function createState(players = [player(1, 'werewolf', 'wolves'), player(2, 'villager', 'good')]): Record<string, unknown> {
  return {
    modeConfig: { sheriff: {}, witch: {}, roleMap: {} },
    werewolfMode: { id: 'fake', name: 'Fake' },
    host: { id: 0, name: 'host' },
    players,
    rounds: [{ day: 1, phase: 'night', night: {} }],
    completedSteps: {},
    winner: null,
    winReason: '',
  };
}

function player(id: number, role: string, faction: string, actions: string[] = []): Record<string, unknown> {
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
  };
}

function window(matchId: string, stepId: string, actionType: string, actorIds: number[]): Record<string, unknown> {
  return {
    id: `${matchId}:${stepId}:${actionType}`,
    matchId,
    stepId,
    actionType,
    actorIds,
    targetIds: [1, 2, 3, 4],
  };
}
});
