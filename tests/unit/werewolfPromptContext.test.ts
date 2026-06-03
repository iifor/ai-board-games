import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWerewolfActionPrompt } from '../../packages/server/modules/werewolf/prompts/context';
import { BasePlayerAgent } from '../../packages/server/modules/agent-core/playerAgent';

function player(id: number, role: string, faction: string, patch: Record<string, unknown> = {}) {
  return {
    id,
    role,
    roleLabel: role,
    faction,
    alive: true,
    canVote: true,
    seerChecks: [],
    ...patch,
  };
}

function runtime(players: Array<Record<string, unknown>>, rounds: Array<Record<string, unknown>>) {
  return {
    agents: players,
    state: { players, rounds },
    modeConfig: {},
  };
}

test('werewolf prompt context includes public exile result and dead player status', () => {
  const players = [
    player(1, 'werewolf', 'wolves'),
    player(2, 'villager', 'good', { alive: false, deathDay: 1, deathReason: '放逐' }),
    player(3, 'seer', 'good'),
  ];
  const rounds = [{
    day: 1,
    publicSummary: '第1天白天结束。',
    votes: { 1: 2, 3: 2 },
    voteTally: { 2: 2 },
    exile: { id: 2, reason: '放逐' },
    night: { deaths: [{ id: 3, reason: '狼人袭击' }] },
    speeches: [{ playerId: 1, text: '我觉得2号可疑。' }],
  }];

  const prompt = buildWerewolfActionPrompt({
    runtime: runtime(players, rounds) as never,
    round: rounds[0] as never,
    actor: players[0] as never,
    actionType: 'wolf_vote',
    taskInstruction: '请选择今晚目标。',
    validTargetIds: [3],
  });

  assert.match(prompt, /2号被放逐出局/);
  assert.match(prompt, /已出局玩家：2号/);
  assert.match(prompt, /第1天放逐投票/);
  assert.match(prompt, /第1晚死亡：3号/);
});

test('werewolf prompt context keeps seer checks private to seer', () => {
  const seer = player(3, 'seer', 'good', { seerChecks: [{ day: 1, target: 1, result: '狼人' }] });
  const villager = player(2, 'villager', 'good');
  const players = [player(1, 'werewolf', 'wolves'), villager, seer];
  const rounds = [{ day: 2, night: {}, speeches: [] }];

  const seerPrompt = buildWerewolfActionPrompt({
    runtime: runtime(players, rounds) as never,
    round: rounds[0] as never,
    actor: seer as never,
    actionType: 'day_speech',
  });
  const villagerPrompt = buildWerewolfActionPrompt({
    runtime: runtime(players, rounds) as never,
    round: rounds[0] as never,
    actor: villager as never,
    actionType: 'day_speech',
  });

  assert.match(seerPrompt, /预言家查验记录/);
  assert.match(seerPrompt, /第1晚查验1号，结果：狼人/);
  assert.doesNotMatch(villagerPrompt, /预言家查验记录/);
  assert.doesNotMatch(villagerPrompt, /结果：狼人/);
});

test('werewolf prompt context shows wolf teammate live and eliminated status only to wolves', () => {
  const wolf = player(1, 'werewolf', 'wolves');
  const deadWolf = player(2, 'werewolf', 'wolves', { alive: false, deathReason: '放逐' });
  const villager = player(3, 'villager', 'good');
  const players = [wolf, deadWolf, villager];
  const rounds = [{ day: 2, night: { wolfStrategy: '统一刀3号。' } }];

  const wolfPrompt = buildWerewolfActionPrompt({
    runtime: runtime(players, rounds) as never,
    round: rounds[0] as never,
    actor: wolf as never,
    actionType: 'wolf_speech',
  });
  const villagerPrompt = buildWerewolfActionPrompt({
    runtime: runtime(players, rounds) as never,
    round: rounds[0] as never,
    actor: villager as never,
    actionType: 'day_speech',
  });

  assert.match(wolfPrompt, /狼队友：2号/);
  assert.match(wolfPrompt, /已出局/);
  assert.match(wolfPrompt, /狼队刀口共识/);
  assert.doesNotMatch(villagerPrompt, /狼队友/);
  assert.doesNotMatch(villagerPrompt, /狼队刀口共识/);
});

test('stateless once calls do not append to PlayerAgent message history without api key', async () => {
  const agent = new BasePlayerAgent({ id: 1 }, 'base prompt');
  const before = agent.messages.length;

  const result = await agent.askTextOnce('say something', { skillId: 'test' });

  assert.equal(result, null);
  assert.equal(agent.messages.length, before);
});
