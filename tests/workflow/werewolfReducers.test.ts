import test from 'node:test';
import assert from 'node:assert/strict';
import { createRound } from '../../packages/server/modules/werewolf/agents';
import { applyActionResults, getActorsForStep, getTargetIds, findPendingHunter } from '../../packages/server/modules/werewolf/reducers';

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

test('reducers select actors and pending hunter', () => {
  const ctx = runtime();
  const round = ctx.state.rounds[0];
  round.night.wolfTarget = 5;
  assert.deepEqual(getActorsForStep(ctx as never, { config: { actionType: 'wolf_kill' } } as never, round as never).map((item: TestAgent) => item.id), [1]);
  assert.deepEqual(getActorsForStep(ctx as never, { config: { actionType: 'witch_save' } } as never, round as never).map((item: TestAgent) => item.id), [4]);

  const hunter = actor(6, 'good', ['shootOnDeath'], { alive: false, hunterShotUsed: false });
  assert.equal(findPendingHunter([hunter] as never, round as never, [{ id: 6 }] as never)?.id, 6);
});
