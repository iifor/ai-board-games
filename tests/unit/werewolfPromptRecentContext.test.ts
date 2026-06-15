import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWerewolfActionPrompt } from '../../packages/server/modules/werewolf/prompts/context';

test('day speech recent context includes sheriff speeches once', () => {
  const players = [
    { id: 1, role: 'seer', faction: 'good', alive: true },
    { id: 12, role: 'villager', faction: 'good', alive: true },
  ];
  const round = {
    day: 1,
    night: {},
    sheriffElection: {
      speeches: [{ playerId: 1, text: '我是预言家，竞选警长。' }],
      runoffSpeeches: [{ playerId: 1, text: '复投请支持我。' }],
    },
    speeches: [],
  };
  const prompt = buildWerewolfActionPrompt({
    runtime: { agents: players, state: { players, rounds: [round] } } as never,
    round: round as never,
    actor: players[1] as never,
    actionType: 'day_speech',
  });

  assert.match(prompt, /警上发言：1号：我是预言家，竞选警长。/);
  assert.match(prompt, /警长复投发言：1号：复投请支持我。/);
  assert.equal(prompt.split('我是预言家，竞选警长。').length - 1, 1);
});
