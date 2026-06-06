import test from 'node:test';
import assert from 'node:assert/strict';
import { createRound } from '../../packages/server/modules/werewolf/agents';
import { resolveNightEffects, resolveExileEffects, applyHunterShot } from '../../packages/server/modules/werewolf/effects';

interface TestAgent {
  id: number;
  alive: boolean;
  faction: string;
  roleConfig: { rule: { actions: Array<{ action: string }> } };
  [key: string]: unknown;
}

function agent(id: number, roleActions: string[] = [], patch: Record<string, unknown> = {}): TestAgent {
  return {
    id,
    alive: true,
    faction: 'good',
    roleConfig: { rule: { actions: roleActions.map((action) => ({ action })) } },
    ...patch
  } as TestAgent;
}

test('night effects respect guard and witch save, then apply poison', () => {
  const agents = [agent(1, [], { faction: 'wolves' }), agent(2), agent(3), agent(4)];
  const round = createRound(1);
  round.night.wolfTarget = 2;
  round.night.guardTarget = 2;
  round.night.witchSave = true;
  round.night.witchSaveTarget = 2;
  round.night.witchPoisonTarget = 3;

  const result = resolveNightEffects(agents as never, round as never);

  assert.deepEqual(result.deaths, [{ id: 3, reason: '女巫毒杀', sourceFaction: 'good', sourceAction: 'witch_poison' }]);
  assert.equal(agents.find((item) => item.id === 2)?.alive, true);
  assert.equal(agents.find((item) => item.id === 3)?.alive, false);
  assert.equal(round.nightRevealed, true);
});

test('wolf kill victory locks before simultaneous poison kills the last wolf', () => {
  const agents = [
    agent(1, [], { faction: 'wolves', roleConfig: { roleType: 'wolf', rule: { actions: [{ action: 'kill' }] } } }),
    agent(2, [], { roleConfig: { roleType: 'god', rule: { actions: [{ action: 'inspectFaction' }] } } }),
    agent(3, [], { roleConfig: { roleType: 'villager', rule: { actions: [] } } }),
  ];
  const round = createRound(1);
  round.night.wolfTarget = 2;
  round.night.witchPoisonTarget = 1;

  resolveNightEffects(agents as never, round as never, { winCondition: 'side' });

  assert.equal(round.winnerLock?.winner, 'wolves');
  assert.equal(round.winnerLock?.sourceAction, 'wolf_kill');
  assert.equal(agents[0].alive, false);
  assert.equal(agents[1].alive, false);
});

test('blocked wolf kill does not lock victory before poison kills the last wolf', () => {
  const agents = [
    agent(1, [], { faction: 'wolves', roleConfig: { roleType: 'wolf', rule: { actions: [{ action: 'kill' }] } } }),
    agent(2, [], { roleConfig: { roleType: 'god', rule: { actions: [{ action: 'inspectFaction' }] } } }),
    agent(3, [], { roleConfig: { roleType: 'villager', rule: { actions: [] } } }),
  ];
  const round = createRound(1);
  round.night.wolfTarget = 2;
  round.night.guardTarget = 2;
  round.night.witchPoisonTarget = 1;

  resolveNightEffects(agents as never, round as never, { winCondition: 'side' });

  assert.equal(round.winnerLock, undefined);
  assert.equal(agents[0].alive, false);
  assert.equal(agents[1].alive, true);
});

test('exile resolves idiot survival before elimination', () => {
  const agents = [
    agent(1),
    agent(2, ['surviveExileOnce']),
    agent(3)
  ];
  const round = createRound(1);
  round.votes = { 1: 2, 3: 2 };

  const result = resolveExileEffects(agents as never, round as never, { sheriff: {}, idiot: {} });

  assert.equal(result.exile, null);
  assert.equal(round.idiotReveal?.id, 2);
  assert.equal(agents[1].alive, true);
  assert.equal(agents[1].canVote, false);
});

test('hunter shot marks hunter used and eliminates target', () => {
  const agents = [
    agent(1, ['shootOnDeath'], { alive: false }),
    agent(2)
  ];
  const round = createRound(1);

  const effect = applyHunterShot(agents as never, round as never, { from: 1, target: 2, reason: 'exile' });

  assert.equal(effect?.type, 'hunter_shot');
  assert.equal(agents[0].hunterShotUsed, true);
  assert.equal(agents[1].alive, false);
  assert.deepEqual(round.hunterShot, { from: 1, target: 2, reason: 'exile' });
});
