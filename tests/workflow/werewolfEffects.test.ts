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
