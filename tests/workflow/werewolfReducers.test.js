const test = require('node:test');
const assert = require('node:assert/strict');
const { createRound } = require('../../server/modules/werewolf/agents');
const { applyActionResults, getActorsForStep, getTargetIds, findPendingHunter } = require('../../server/modules/werewolf/reducers');

function actor(id, faction, actions = [], patch = {}) {
  return {
    id,
    faction,
    alive: true,
    canVote: true,
    votes: [],
    seerChecks: [],
    roleConfig: { name: String(id), rule: { actions: actions.map((action) => ({ action })) } },
    ...patch
  };
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

  applyActionResults(ctx, step, [{ actorId: 1, payload: { target: 5, speech: 'push 5' } }]);

  const round = ctx.state.rounds[0];
  assert.equal(round.night.wolfTarget, 5);
  assert.deepEqual(round.night.wolfChoices, { 1: 5 });
  assert.equal(round.night.wolfSpeeches[0].text, 'push 5');
  assert.deepEqual(getTargetIds(ctx, step), [2, 3, 4, 5]);
});

test('reducers apply role action payloads to round and actors', () => {
  const ctx = runtime();
  applyActionResults(ctx, { config: { day: 1, actionType: 'seer_check' } }, [{ actorId: 2, payload: { target: 1, result: 'wolf' } }]);
  applyActionResults(ctx, { config: { day: 1, actionType: 'guard_protect' } }, [{ actorId: 3, payload: { target: 2 } }]);
  ctx.state.rounds[0].night.wolfTarget = 2;
  applyActionResults(ctx, { config: { day: 1, actionType: 'witch_save' } }, [{ actorId: 4, payload: { use: true } }]);
  applyActionResults(ctx, { config: { day: 1, actionType: 'witch_poison' } }, [{ actorId: 4, payload: { use: true, target: 5 } }]);

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
  assert.deepEqual(getActorsForStep(ctx, { config: { actionType: 'wolf_kill' } }, round).map((item) => item.id), [1]);
  assert.deepEqual(getActorsForStep(ctx, { config: { actionType: 'witch_save' } }, round).map((item) => item.id), [4]);

  const hunter = actor(6, 'good', ['shootOnDeath'], { alive: false, hunterShotUsed: false });
  assert.equal(findPendingHunter([hunter], round, [{ id: 6 }]).id, 6);
});
