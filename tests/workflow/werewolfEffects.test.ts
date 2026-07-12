import test from 'node:test';
import assert from 'node:assert/strict';
import { createRound } from '../../packages/server/modules/werewolf/agents';
import { resolveNightEffects, resolveExileEffects, applyHunterShot } from '../../packages/server/modules/werewolf/effects';
import {
  checkWin,
  checkDayWin,
  getAliveVotePower,
  getAliveRosterStats,
  resolveWinAfterDeaths,
  resolveWinAfterDeathsDetailed,
} from '../../packages/server/modules/werewolf/winCheck';
import {
  applyLastWordsResults,
  enqueueExileLastWords,
  enqueueNightLastWords,
  getPendingLastWords,
} from '../../packages/server/modules/werewolf/lastWordsWorkflow';
import { normalizeWerewolfWinCondition } from '../../packages/server/modules/werewolf-config/utils';

interface TestAgent {
  id: number;
  alive: boolean;
  faction: string;
  roleConfig: { rule: { actions: Array<{ action: string }> } };
  [key: string]: unknown;
}

test('thick wolf absorbs only the first unresolved escape hunter hunt', () => {
  const thickWolf = agent(4, [], { role: 'thick_wolf', thickWolfHuntHits: 0 });
  const agents = [agent(1, ['hunterHunt'], { role: 'escape_hunter', faction: 'hunters' }), thickWolf];
  const firstRound = { day: 1, night: { escapeHunterTarget: 4 } } as never;

  const first = resolveNightEffects(agents as never, firstRound, { id: 'wolf-escape-10' });
  assert.equal(first.deaths.length, 0);
  assert.equal(thickWolf.thickWolfHuntHits, 1);
  assert.deepEqual((firstRound as any).night.thickWolfArmorBreak, { targetId: 4 });

  const second = resolveNightEffects(agents as never, { day: 2, night: { escapeHunterTarget: 4 } } as never, { id: 'wolf-escape-10' });
  assert.equal(second.deaths[0]?.id, 4);
  assert.equal(second.deaths[0]?.sourceAction, 'escape_hunter_hunt');
});

test('witch antidote preserves thick wolf armor against escape hunter hunt', () => {
  const thickWolf = agent(4, [], { role: 'thick_wolf', thickWolfHuntHits: 0 });
  const round = { day: 1, night: { escapeHunterTarget: 4, witchSave: true, witchSaveTarget: 4 } } as never;

  const result = resolveNightEffects([thickWolf] as never, round, { id: 'wolf-escape-10' });

  assert.equal(result.deaths.length, 0);
  assert.equal(thickWolf.thickWolfHuntHits, 0);
  assert.equal((round as any).night.thickWolfArmorBreak, undefined);
});

test('wolf escape uses protected wolves and escape hunters for winners', () => {
  const huntersDead = [
    agent(1, ['hunterHunt'], { role: 'escape_hunter', faction: 'hunters', alive: false }),
    agent(2, [], { role: 'tamed_werewolf', faction: 'good' }),
  ];
  assert.equal(checkWin(huntersDead as never, 2, { id: 'wolf-escape-10', winCondition: 'wolf_escape' }).winner, 'good');

  const wolvesDead = [
    agent(1, ['hunterHunt'], { role: 'escape_hunter', faction: 'hunters' }),
    agent(2, [], { role: 'thick_wolf', faction: 'good', alive: false }),
    agent(3, [], { role: 'tamed_werewolf', faction: 'good', alive: false }),
  ];
  assert.equal(checkWin(wolvesDead as never, 2, { id: 'wolf-escape-10', winCondition: 'wolf_escape' }).winner, 'hunters');
  assert.equal(checkDayWin(wolvesDead as never, 2, { id: 'wolf-escape-10', winCondition: 'wolf_escape' }).winner, 'hunters');
});

test('escape hunter reuses death shot and poison disables it', () => {
  const shootAction = { action: 'shootOnDeath', disabledDeathReasons: ['witch_poison', '女巫毒杀'] };
  const hunter = agent(1, [], {
    role: 'escape_hunter',
    faction: 'hunters',
    alive: false,
    deathReason: '放逐',
    roleConfig: { rule: { actions: [shootAction] } },
  });
  const target = agent(2);
  assert.ok(applyHunterShot([hunter, target] as never, createRound(1) as never, { from: 1, target: 2, reason: '放逐' }));
  assert.equal(target.alive, false);

  const poisonedHunter = agent(3, [], {
    role: 'escape_hunter',
    faction: 'hunters',
    alive: false,
    deathReason: 'witch_poison',
    roleConfig: { rule: { actions: [shootAction] } },
  });
  assert.equal(applyHunterShot([poisonedHunter, agent(4)] as never, createRound(1) as never, { from: 3, target: 4, reason: 'witch_poison' }), null);
});

function agent(id: number, roleActions: string[] = [], patch: Record<string, unknown> = {}): TestAgent {
  return {
    id,
    alive: true,
    faction: 'good',
    roleConfig: { rule: { actions: roleActions.map((action) => ({ action })) } },
    ...patch
  } as TestAgent;
}

test('night effects reject poison when antidote was used in the same night', () => {
  const agents = [agent(1, [], { faction: 'wolves' }), agent(2), agent(3), agent(4)];
  const round = createRound(1);
  round.night.wolfTarget = 2;
  round.night.guardTarget = 2;
  round.night.witchSave = true;
  round.night.witchSaveTarget = 2;
  round.night.witchPoisonTarget = 3;

  const result = resolveNightEffects(agents as never, round as never);

  assert.deepEqual(result.deaths, []);
  assert.equal(agents.find((item) => item.id === 2)?.alive, true);
  assert.equal(agents.find((item) => item.id === 3)?.alive, true);
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

test('wolf kill against an already dead target does not create a winner lock', () => {
  const agents = [
    agent(1, [], { faction: 'wolves', roleConfig: { roleType: 'wolf', rule: { actions: [{ action: 'kill' }] } } }),
    agent(2, [], { alive: false, roleConfig: { roleType: 'god', rule: { actions: [{ action: 'inspectFaction' }] } } }),
    agent(3, [], { roleConfig: { roleType: 'villager', rule: { actions: [] } } }),
  ];
  const round = createRound(1);
  round.night.wolfTarget = 2;

  resolveNightEffects(agents as never, round as never, { winCondition: 'side' });

  assert.equal(round.winnerLock, undefined);
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

test('wild child turns into wolf when model dies', () => {
  const agents = [
    agent(1, ['chooseMaster'], { role: 'wild_child', wildChildModelId: 2 }),
    agent(2, [], { role: 'villager' }),
    agent(3, ['kill'], { faction: 'wolves', role: 'werewolf' }),
  ];
  const round = createRound(1);
  round.votes = { 1: 2, 3: 2 };

  resolveExileEffects(agents as never, round as never);

  assert.equal(agents[0].faction, 'wolves');
  assert.equal(agents[0].wildChildTransformed, true);
  assert.equal(agents[0].roleConfig.rule.actions.some((item) => item.action === 'kill'), true);
});

test('wolf seed infects successful wolf kill target and fails when kill is blocked', () => {
  const agents = [
    agent(1, ['kill', 'infect'], { faction: 'wolves', role: 'wolf_seed' }),
    agent(2, ['kill'], { faction: 'wolves', role: 'werewolf' }),
    agent(3, [], { role: 'hunter', roleConfig: { roleType: 'god', rule: { actions: [{ action: 'shootOnDeath' }] } } }),
    agent(4, ['guard'], { role: 'guard' }),
  ];
  const round = createRound(1);
  round.night.wolfTarget = 3;
  round.night.wolfSeedInfect = { actorId: 1, targetId: 3, used: true, success: false };

  resolveNightEffects(agents as never, round as never, { id: 'wolf-seed-hidden-wolf-12', winCondition: 'side' });

  assert.equal(agents[2].alive, true);
  assert.equal(agents[2].faction, 'wolves');
  assert.equal(agents[2].wolfSeedInfected, true);
  assert.equal(agents[2].roleConfig.rule.actions.some((item) => item.action === 'kill'), true);
  assert.equal(round.night.wolfSeedInfect.success, true);
  assert.deepEqual(round.night.deaths, []);

  const blockedAgents = [
    agent(1, ['kill', 'infect'], { faction: 'wolves', role: 'wolf_seed' }),
    agent(2, [], { role: 'villager' }),
  ];
  const blockedRound = createRound(1);
  blockedRound.night.wolfTarget = 2;
  blockedRound.night.guardTarget = 2;
  blockedRound.night.wolfSeedInfect = { actorId: 1, targetId: 2, used: true, success: false };

  resolveNightEffects(blockedAgents as never, blockedRound as never, { id: 'wolf-seed-hidden-wolf-12', winCondition: 'side' });

  assert.equal(blockedAgents[1].faction, 'good');
  assert.equal(blockedAgents[1].wolfSeedInfected, undefined);
  assert.equal(blockedRound.night.wolfSeedInfect.success, false);
});

test('bombman exiled by vote blasts voters without death skill', () => {
  const agents = [
    agent(1, [], { role: 'bombman', roleConfig: { roleType: 'god', rule: { actions: [] } } }),
    agent(2, ['shootOnDeath'], { role: 'hunter', roleConfig: { roleType: 'god', rule: { actions: [{ action: 'shootOnDeath' }] } } }),
    agent(3, ['kill'], { faction: 'wolves', role: 'werewolf' }),
  ];
  const round = createRound(1);
  round.votes = { 2: 1, 3: 1 };

  const result = resolveExileEffects(agents as never, round as never);

  assert.equal(agents[0].alive, false);
  assert.equal(agents[1].alive, false);
  assert.equal(agents[1].deathReason, 'bombman_blast');
  assert.equal(result.effects.some((effect) => effect.type === 'bombman_blast'), true);
});

test('nine tailed fox loses tails from good deaths and dies at zero', () => {
  const agents = [
    agent(1, [], { role: 'nine_tailed_fox', nineTailedFoxTails: 3 }),
    agent(2, [], { role: 'villager', roleConfig: { roleType: 'villager', rule: { actions: [] } } }),
    agent(3, [], { role: 'seer', roleConfig: { roleType: 'god', rule: { actions: [{ action: 'inspectFaction' }] } } }),
    agent(4, ['kill'], { faction: 'wolves', role: 'werewolf' }),
  ];
  const round = createRound(1);
  round.night.wolfTarget = 2;
  round.night.witchPoisonTarget = 3;

  resolveNightEffects(agents as never, round as never);

  assert.equal(agents[0].alive, false);
  assert.equal(agents[0].nineTailedFoxTails, 0);
  assert.equal(agents[0].deathReason, 'nine_tailed_fox_tails');
});

test('dreamer target blocks wolf kill and witch poison', () => {
  const agents = [
    agent(1, [], { faction: 'wolves', role: 'werewolf' }),
    agent(2, ['dream'], { role: 'dreamer' }),
    agent(3),
  ];
  const round = createRound(1);
  round.night.wolfTarget = 3;
  round.night.witchPoisonTarget = 3;
  round.night.dreamerTarget = 3;

  const result = resolveNightEffects(agents as never, round as never);

  assert.deepEqual(result.deaths, []);
  assert.equal(agents[2].alive, true);
});

test('spirit wolf guard blocks wolf kill and witch poison', () => {
  const agents = [
    agent(1, ['kill'], { faction: 'wolves', role: 'spirit_wolf' }),
    agent(2, [], { role: 'villager' }),
  ];
  const round = createRound(2);
  round.night.wolfTarget = 2;
  round.night.witchPoisonTarget = 2;
  round.night.spiritWolfGuardTarget = 2;

  const result = resolveNightEffects(agents as never, round as never);

  assert.deepEqual(result.deaths, []);
  assert.equal(agents[1].alive, true);
});

test('spirit wolf antidote saves witch poison target', () => {
  const agents = [
    agent(1, ['kill'], { faction: 'wolves', role: 'spirit_wolf' }),
    agent(2, [], { role: 'villager' }),
  ];
  const round = createRound(2);
  round.night.witchPoisonTarget = 2;
  round.night.spiritWolfAntidoteTarget = 2;

  const result = resolveNightEffects(agents as never, round as never);

  assert.deepEqual(result.deaths, []);
  assert.equal(agents[1].alive, true);
});

test('illusionist redirects wolf kill and witch poison to illusion target', () => {
  const wolfKillAgents = [
    agent(1, ['kill'], { faction: 'wolves', role: 'werewolf' }),
    agent(2, ['illusion'], { role: 'illusionist' }),
    agent(3, [], { role: 'villager' }),
  ];
  const wolfRound = createRound(1);
  wolfRound.night.wolfTarget = 2;
  wolfRound.night.illusionTarget = 3;

  const wolfResult = resolveNightEffects(wolfKillAgents as never, wolfRound as never);
  assert.equal(wolfKillAgents[1].alive, true);
  assert.equal(wolfKillAgents[2].alive, false);
  assert.deepEqual(wolfResult.deaths.map((death) => ({ id: death.id, sourceAction: death.sourceAction })), [
    { id: 3, sourceAction: 'illusion_substitute' },
  ]);

  const poisonAgents = [
    agent(1, ['kill'], { faction: 'wolves', role: 'werewolf' }),
    agent(2, ['illusion'], { role: 'illusionist' }),
    agent(3, [], { role: 'villager' }),
  ];
  const poisonRound = createRound(1);
  poisonRound.night.witchPoisonTarget = 2;
  poisonRound.night.illusionTarget = 3;

  const poisonResult = resolveNightEffects(poisonAgents as never, poisonRound as never);
  assert.equal(poisonAgents[1].alive, true);
  assert.equal(poisonAgents[2].alive, false);
  assert.deepEqual(poisonResult.deaths.map((death) => ({ id: death.id, sourceAction: death.sourceAction })), [
    { id: 3, sourceAction: 'illusion_substitute' },
  ]);
});

test('magician swap redirects wolf kill and witch poison resolution', () => {
  const agents = [
    agent(1, ['swap'], { role: 'magician' }),
    agent(2, ['kill'], { faction: 'wolves', role: 'werewolf' }),
    agent(3, [], { role: 'villager' }),
    agent(4, [], { role: 'villager' }),
  ];
  const round = createRound(1);
  round.night.magicianSwap = { firstTarget: 3, secondTarget: 4 };
  round.night.wolfTarget = 3;
  round.night.witchPoisonTarget = 4;

  const result = resolveNightEffects(agents as never, round as never, { winCondition: 'side' });

  assert.equal(agents[2].alive, false);
  assert.equal(agents[2].deathReason, '女巫毒杀');
  assert.equal(agents[3].alive, false);
  assert.equal(agents[3].deathReason, '狼人袭击');
  assert.deepEqual(result.deaths.map((death) => ({ id: death.id, reason: death.reason })), [
    { id: 4, reason: '狼人袭击' },
    { id: 3, reason: '女巫毒杀' },
  ]);
});

test('magician swap lets witch save the swapped wolf kill result', () => {
  const agents = [
    agent(1, ['swap'], { role: 'magician' }),
    agent(2, ['kill'], { faction: 'wolves', role: 'werewolf' }),
    agent(3, [], { role: 'villager' }),
    agent(4, [], { role: 'villager' }),
  ];
  const round = createRound(1);
  round.night.magicianSwap = { firstTarget: 3, secondTarget: 4 };
  round.night.wolfTarget = 3;
  round.night.witchSave = true;
  round.night.witchSaveTarget = 3;

  const result = resolveNightEffects(agents as never, round as never, { winCondition: 'side' });

  assert.deepEqual(result.deaths, []);
  assert.equal(agents[3].alive, true);
});

test('dreamer repeated target dies from dream', () => {
  const agents = [
    agent(1, [], { faction: 'wolves', role: 'werewolf' }),
    agent(2, ['dream'], { role: 'dreamer' }),
    agent(3),
  ];
  const round = createRound(2);
  round.night.dreamerTarget = 3;
  round.night.dreamerRepeatedTarget = true;

  const result = resolveNightEffects(agents as never, round as never);

  assert.deepEqual(result.deaths, [{ id: 3, reason: 'dreamer_repeat', sourceFaction: 'good', sourceAction: 'dreamer_dream' }]);
  assert.equal(agents[2].alive, false);
});

test('death shot skill respects disabled death reasons', () => {
  const agents = [
    agent(1, ['shootOnDeath'], {
      alive: false,
      roleConfig: { rule: { actions: [{ action: 'shootOnDeath', disabledDeathReasons: ['witch_poison'] }] } },
      deathReason: 'witch_poison',
    }),
    agent(2),
  ];
  const round = createRound(1);

  const effect = applyHunterShot(agents as never, round as never, { from: 1, target: 2, reason: 'witch_poison' });

  assert.equal(effect, null);
  assert.equal(agents[1].alive, true);
});

test('win checks use the current alive roster for all supported modes', () => {
  const roster = [
    agent(1, ['kill'], { faction: 'wolves', roleConfig: { roleType: 'wolf', rule: { actions: [{ action: 'kill' }] } } }),
    agent(2, [], { roleConfig: { roleType: 'villager', rule: { actions: [] } } }),
    agent(3, ['inspectFaction'], { roleConfig: { roleType: 'god', rule: { actions: [{ action: 'inspectFaction' }] } } }),
  ];

  assert.equal(checkWin(roster.map((item) => ({ ...item, alive: item.id !== 2 })) as never, 1, { winCondition: 'side' }).winner, 'wolves');
  assert.equal(checkWin(roster.map((item) => ({ ...item, alive: item.id !== 3 })) as never, 1, { winCondition: 'gods' }).winner, 'wolves');
  assert.equal(checkWin(roster.map((item) => ({ ...item, alive: item.id !== 2 })) as never, 1, { winCondition: 'villagers' }).winner, 'wolves');
  assert.equal(checkWin(roster.map((item) => ({ ...item, alive: item.id === 1 })) as never, 1, { winCondition: 'all' }).winner, 'wolves');
  assert.equal(checkWin(roster.map((item) => ({ ...item, alive: item.id !== 3 })) as never, 1, { winCondition: 'all' }).winner, null);
  assert.equal(checkWin(roster.map((item) => ({ ...item, alive: item.id !== 1 })) as never, 1, { winCondition: 'side' }).winner, 'good');
  assert.equal(checkWin(roster.map((item) => ({ ...item, alive: item.id !== 2 })) as never, 1, { winCondition: 'single' }).winner, 'wolves');
  assert.equal(normalizeWerewolfWinCondition('single'), 'side');
  assert.equal(normalizeWerewolfWinCondition('gods'), 'gods');
  assert.equal(normalizeWerewolfWinCondition('villagers'), 'villagers');
  assert.equal(normalizeWerewolfWinCondition('all'), 'all');
});

test('single hunter or witch death does not eliminate the god side', () => {
  const roster = [
    agent(1, ['kill'], { role: 'werewolf', faction: 'wolves', roleConfig: { roleType: 'wolf', rule: { actions: [{ action: 'kill' }] } } }),
    agent(2, ['poison'], { role: 'witch', alive: false, roleConfig: { roleType: 'witch', rule: { actions: [{ action: 'poison' }] } } }),
    agent(3, ['inspectFaction'], { role: 'seer', roleConfig: undefined }),
    agent(4, ['shootOnDeath'], { role: 'hunter', roleConfig: { rule: { actions: [{ action: 'shootOnDeath' }] } } }),
    agent(5, [], { role: 'villager', roleConfig: undefined }),
  ];

  assert.deepEqual(getAliveRosterStats(roster as never), {
    wolves: 1,
    gods: 2,
    villagers: 1,
    good: 3,
  });
  assert.equal(checkWin(roster as never, 1, { winCondition: 'side' }).winner, null);

  roster[3].alive = false;
  assert.equal(checkWin(roster as never, 1, { winCondition: 'side' }).winner, null);
  roster[2].alive = false;
  assert.equal(checkWin(roster as never, 1, { winCondition: 'side' }).winner, 'wolves');
});

test('day vote power requires wolves to be strictly greater than good', () => {
  const roster = [
    agent(1, ['kill'], { faction: 'wolves', roleConfig: { roleType: 'wolf', rule: { actions: [{ action: 'kill' }] } } }),
    agent(2, ['kill'], { faction: 'wolves', roleConfig: { roleType: 'wolf', rule: { actions: [{ action: 'kill' }] } } }),
    agent(3, [], { roleConfig: { roleType: 'god', rule: { actions: [{ action: 'inspectFaction' }] } } }),
    agent(4, [], { roleConfig: { roleType: 'villager', rule: { actions: [] } } }),
  ];

  assert.deepEqual(getAliveVotePower(roster as never, 3, 1.5), { wolves: 2, good: 2.5 });
  assert.equal(checkDayWin(roster as never, 2, { winCondition: 'all', sheriff: { voteWeight: 1.5 } }, 3).winner, null);
  assert.equal(checkDayWin(roster as never, 2, { winCondition: 'all', sheriff: { voteWeight: 1.5 } }, 1).winner, 'wolves');

  roster[3].canVote = false;
  assert.equal(checkDayWin(roster as never, 2, { winCondition: 'all', sheriff: { voteWeight: 1.5 } }, 3).winner, 'wolves');
  roster[2].canVote = false;
  assert.equal(checkDayWin(roster as never, 2, { winCondition: 'all', sheriff: { voteWeight: 1.5 } }, null).winner, 'wolves');
});

test('vote power victory is evaluated during day but not night', () => {
  const roster = [
    agent(1, ['kill'], { faction: 'wolves', roleConfig: { roleType: 'wolf', rule: { actions: [{ action: 'kill' }] } } }),
    agent(2, ['kill'], { faction: 'wolves', roleConfig: { roleType: 'wolf', rule: { actions: [{ action: 'kill' }] } } }),
    agent(3, [], { roleConfig: { roleType: 'god', rule: { actions: [{ action: 'inspectFaction' }] } } }),
  ];
  const round = createRound(2);
  round.phase = 'night';
  assert.equal(resolveWinAfterDeathsDetailed(roster as never, round as never, 2, { winCondition: 'all' }).result.winner, null);
  round.phase = 'day';
  assert.equal(resolveWinAfterDeathsDetailed(roster as never, round as never, 2, { winCondition: 'all' }).result.winner, 'wolves');
});

test('unverifiable legacy wolf winner lock cannot end the game early', () => {
  const roster = [
    agent(1, ['kill'], { role: 'werewolf', faction: 'wolves', roleConfig: { roleType: 'wolf', rule: { actions: [{ action: 'kill' }] } } }),
    agent(2, ['poison'], { role: 'witch', alive: false, roleConfig: { roleType: 'god', rule: { actions: [{ action: 'poison' }] } } }),
    agent(3, ['inspectFaction'], { role: 'seer', roleConfig: { roleType: 'god', rule: { actions: [{ action: 'inspectFaction' }] } } }),
    agent(4, [], { role: 'villager', roleConfig: { roleType: 'villager', rule: { actions: [] } } }),
  ];
  const round = createRound(1);
  (round as Record<string, unknown>).winnerLock = {
    winner: 'wolves',
    winReason: 'legacy invalid lock',
    sourceFaction: 'wolves',
    sourceAction: 'wolf_kill',
  };

  const resolution = resolveWinAfterDeathsDetailed(roster as never, round as never, 1, { winCondition: 'side' });
  assert.equal(resolution.result.winner, null);
  assert.equal(resolution.rejectedLock?.reason, 'missing_trigger_roster');
  assert.equal(resolveWinAfterDeaths(roster as never, round as never, 1, { winCondition: 'side' }).winner, null);
});

test('winner lock whose trigger roster did not win is rejected', () => {
  const roster = [
    agent(1, ['kill'], { role: 'werewolf', faction: 'wolves', roleConfig: { roleType: 'wolf', rule: { actions: [{ action: 'kill' }] } } }),
    agent(2, ['inspectFaction'], { role: 'seer', roleConfig: { roleType: 'god', rule: { actions: [{ action: 'inspectFaction' }] } } }),
    agent(3, ['surviveExileOnce'], { role: 'idiot', roleConfig: { roleType: 'god', rule: { actions: [{ action: 'surviveExileOnce' }] } } }),
    agent(4, [], { role: 'villager', roleConfig: { roleType: 'villager', rule: { actions: [] } } }),
  ];
  const round = createRound(1);
  (round as Record<string, unknown>).winnerLock = {
    winner: 'wolves',
    winReason: 'invalid lock',
    sourceFaction: 'wolves',
    sourceAction: 'wolf_kill',
    winCondition: 'side',
    triggerRoster: { wolves: 1, gods: 2, villagers: 1, good: 3 },
  };

  const resolution = resolveWinAfterDeathsDetailed(roster as never, round as never, 1, { winCondition: 'side' });
  assert.equal(resolution.result.winner, null);
  assert.equal(resolution.rejectedLock?.reason, 'trigger_roster_not_winning');
});

test('last words queue preserves first-night death order and excludes later nights', () => {
  const round = createRound(1);
  enqueueNightLastWords(round, [2, 3, 2]);
  enqueueNightLastWords(round, [4]);
  assert.deepEqual(getPendingLastWords(round), [
    { playerId: 2, source: 'night' },
    { playerId: 3, source: 'night' },
    { playerId: 4, source: 'night' },
  ]);

  const records = applyLastWordsResults(round, [
    { actorId: 4, payload: { text: 'four' } },
    { actorId: 2, payload: { text: 'two' } },
    { actorId: 3, payload: { text: 'three' } },
  ]);
  assert.deepEqual(records.map((item) => item.playerId), [2, 3, 4]);

  const laterRound = createRound(2);
  enqueueNightLastWords(laterRound, [2]);
  assert.deepEqual(getPendingLastWords(laterRound), []);
  enqueueExileLastWords(laterRound, 3);
  assert.deepEqual(getPendingLastWords(laterRound), [{ playerId: 3, source: 'exile' }]);
});

test('animal zoo crow curse adds two exile votes', () => {
  const round = createRound(1);
  const cursed = agent(2);
  const agents = [agent(1), cursed, agent(3), agent(4)];
  round.crowCursedPlayerId = 2;
  round.votes = {
    1: 2,
    3: 4,
  };

  const result = resolveExileEffects(agents as never, round as never, { id: 'animal-zoo-12', sheriff: {}, winCondition: 'side' });

  assert.equal(round.voteTally!['2'], 3);
  assert.equal(result.exile?.id, 2);
  assert.equal(cursed.alive, false);
});

test('lover death chains to paired lover and mixed lovers can win alone', () => {
  const round = createRound(1);
  const cupid = agent(1, ['linkLovers'], { faction: 'third_party', role: 'cupid' });
  const wolfLover = agent(2, ['kill'], { faction: 'third_party', role: 'werewolf', loverId: 3 });
  const goodLover = agent(3, [], { faction: 'third_party', role: 'villager', loverId: 2 });
  const otherWolf = agent(4, ['kill'], { faction: 'wolves', role: 'werewolf' });
  round.night.wolfTarget = 2;

  const result = resolveNightEffects([cupid, wolfLover, goodLover, otherWolf] as never, round as never, { winCondition: 'side' });

  assert.equal(wolfLover.alive, false);
  assert.equal(goodLover.alive, false);
  assert.deepEqual(result.deaths.map((death) => death.id), [2, 3]);
  assert.equal(result.deaths[1].reason, 'lover_link');

  otherWolf.alive = false;
  assert.equal(checkWin([cupid, wolfLover, goodLover, otherWolf] as never, 2, { winCondition: 'side' }).winner, 'third_party');
});

test('ghost bride kill resolves and witness can win as third party', () => {
  const round = createRound(1);
  const bride = agent(1, [], { faction: 'third_party', role: 'ghost_bride', loverId: 2, ghostBridePartnerId: 2, ghostBrideWitnessId: 3 });
  const groom = agent(2, [], { faction: 'third_party', role: 'villager', loverId: 1, ghostBridePartnerId: 1, ghostBrideWitnessId: 3 });
  const witness = agent(3, [], { faction: 'third_party', role: 'hunter', witnessForGhostBride: 1 });
  const villager = agent(4, [], { faction: 'good', role: 'villager' });
  round.night.ghostBrideTarget = 4;

  const result = resolveNightEffects([bride, groom, witness, villager] as never, round as never, { winCondition: 'side' });

  assert.equal(villager.alive, false);
  assert.deepEqual(result.deaths.map((death) => ({ id: death.id, sourceAction: death.sourceAction })), [
    { id: 4, sourceAction: 'ghost_bride_kill' },
  ]);

  bride.alive = false;
  groom.alive = false;
  assert.equal(checkWin([bride, groom, witness, villager] as never, 2, { winCondition: 'side' }).winner, 'third_party');
});

test('firepower mode kills big tree after all saplings die', () => {
  const agents = [
    agent(1, ['kill'], { faction: 'wolves', role: 'white_wolf_king' }),
    agent(2, [], { role: 'sapling' }),
    agent(3, [], { role: 'sapling' }),
    agent(4, [], { role: 'big_tree' }),
    agent(5, [], { role: 'witch', roleConfig: { roleType: 'god', rule: { actions: [{ action: 'poison' }] } } }),
  ];
  agents[1].alive = false;
  const round = createRound(1);
  round.night.wolfTarget = 3;

  const result = resolveNightEffects(agents as never, round as never, { id: 'firepower-12', winCondition: 'side' });

  assert.deepEqual(result.deaths.map((death) => ({ id: death.id, reason: death.reason })), [
    { id: 3, reason: '狼人袭击' },
    { id: 4, reason: '树苗全灭' },
  ]);
  assert.equal(agents[3].alive, false);
  assert.equal(agents[4].godSkillsDisabled, true);

  const exileAgents = [
    agent(1, [], { role: 'sapling', alive: false }),
    agent(2, [], { role: 'sapling' }),
    agent(3, [], { role: 'big_tree' }),
  ];
  const exileRound = createRound(1);
  exileRound.votes = { 3: 2 };

  resolveExileEffects(exileAgents as never, exileRound as never, { id: 'firepower-12', sheriff: {}, winCondition: 'side' });

  assert.equal(exileAgents[1].alive, false);
  assert.equal(exileAgents[2].alive, false);

  const shotAgents = [
    agent(1, ['shootOnDeath'], { alive: false, role: 'hunter' }),
    agent(2, [], { role: 'sapling', alive: false }),
    agent(3, [], { role: 'sapling' }),
    agent(4, [], { role: 'big_tree' }),
  ];
  const shotRound = createRound(1);

  applyHunterShot(shotAgents as never, shotRound as never, { from: 1, target: 3, reason: 'exile' }, { id: 'firepower-12' });

  assert.equal(shotAgents[2].alive, false);
  assert.equal(shotAgents[3].alive, false);
});

test('demon hunter hunts wolves and dies when hunting good players', () => {
  const wolfRound = createRound(2);
  const wolf = agent(1, ['kill'], { faction: 'wolves', role: 'werewolf' });
  const hunter = agent(2, ['demonHunterHunt'], { role: 'demon_hunter', roleConfig: { roleType: 'god', rule: { actions: [{ action: 'demonHunterHunt' }] } } });
  const villager = agent(3, [], { role: 'villager' });
  wolfRound.night.demonHunterTarget = 1;

  const wolfResult = resolveNightEffects([wolf, hunter, villager] as never, wolfRound as never, { id: 'magic-wolf-demon-hunter-12', winCondition: 'side' });

  assert.equal(wolf.alive, false);
  assert.equal(hunter.alive, true);
  assert.deepEqual(wolfResult.deaths.map((death) => ({ id: death.id, sourceAction: death.sourceAction })), [
    { id: 1, sourceAction: 'demon_hunter_hunt' },
  ]);

  const goodRound = createRound(2);
  const goodHunter = agent(2, ['demonHunterHunt'], { role: 'demon_hunter', roleConfig: { roleType: 'god', rule: { actions: [{ action: 'demonHunterHunt' }] } } });
  const goodTarget = agent(3, [], { role: 'villager' });
  goodRound.night.demonHunterTarget = 3;

  const goodResult = resolveNightEffects([agent(1, ['kill'], { faction: 'wolves', role: 'werewolf' }), goodHunter, goodTarget] as never, goodRound as never, { id: 'magic-wolf-demon-hunter-12', winCondition: 'side' });

  assert.equal(goodHunter.alive, false);
  assert.equal(goodTarget.alive, true);
  assert.deepEqual(goodResult.deaths.map((death) => death.id), [2]);
});

test('demon hunter ignores witch poison and magic wolf delayed exile resolves next day', () => {
  const poisonRound = createRound(2);
  const demonHunter = agent(1, ['demonHunterHunt'], { role: 'demon_hunter', roleConfig: { roleType: 'god', rule: { actions: [{ action: 'demonHunterHunt' }] } } });
  const witch = agent(2, ['poison'], { role: 'witch' });
  poisonRound.night.witchPoisonTarget = 1;

  const poisonResult = resolveNightEffects([demonHunter, witch, agent(3, ['kill'], { faction: 'wolves', role: 'werewolf' })] as never, poisonRound as never, { id: 'magic-wolf-demon-hunter-12', winCondition: 'side' });

  assert.equal(demonHunter.alive, true);
  assert.deepEqual(poisonResult.deaths, []);

  const exileRound = createRound(1);
  const magicWolf = agent(1, ['kill', 'selfDestruct'], { faction: 'wolves', role: 'magic_wolf' });
  const seer = agent(2, ['inspectFaction'], { role: 'seer', roleConfig: { roleType: 'god', rule: { actions: [{ action: 'inspectFaction' }] } } });
  const villager = agent(3, [], { role: 'villager' });
  exileRound.votes = { 2: 1, 3: 1 };

  const exileResult = resolveExileEffects([magicWolf, seer, villager] as never, exileRound as never, { id: 'magic-wolf-demon-hunter-12', sheriff: {}, winCondition: 'side' });

  assert.equal(exileResult.exile?.id, 1);
  assert.equal(magicWolf.alive, true);
  assert.equal(magicWolf.canVote, false);
  assert.equal(magicWolf.magicWolfDelayedDeathDay, 2);

  const delayedRound = createRound(2);
  const delayedResult = resolveNightEffects([magicWolf, seer, villager] as never, delayedRound as never, { id: 'magic-wolf-demon-hunter-12', winCondition: 'side' });

  assert.equal(magicWolf.alive, false);
  assert.deepEqual(delayedResult.deaths.map((death) => ({ id: death.id, reason: death.reason, sourceAction: death.sourceAction })), [
    { id: 1, reason: '魔狼血脉耗尽', sourceAction: 'magic_wolf_delayed_death' },
  ]);
});
