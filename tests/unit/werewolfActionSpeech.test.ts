import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actionSpeechContract,
  buildActionSpeechPrompt,
  isEffectiveActionPayload,
  isNaturalActionSpeechType,
  isResultDependentActionSpeechType,
  NATURAL_ACTION_SPEECH_TYPES,
  RESULT_DEPENDENT_ACTION_SPEECH_TYPES,
  normalizeActionSpeechForPayload,
  resolveActionSpeech,
} from '../../packages/server/modules/werewolf/actionSpeech';
import { resolveAiActionSpeech, runActionWindowAiTask } from '../../packages/server/modules/werewolf/aiActions';
import { BasePlayerAgent } from '../../packages/server/modules/agent-core/playerAgent';
import { createRound } from '../../packages/server/modules/werewolf/agents';
import { setDbExecutorForTests } from '../../packages/server/db';
import type { DbExecutor } from '../../packages/server/db/types';

test('action speech policy scopes natural and result-dependent actions', () => {
  const naturalActionTypes = [
    'fortune_teller_mark', 'big_bad_wolf_kill', 'ghost_bride_link', 'ghost_bride_kill',
    'demon_hunter_hunt', 'spirit_wolf_learn', 'spirit_wolf_guard', 'spirit_wolf_antidote',
    'wolf_witch_curse', 'illusionist_illusion', 'crow_curse', 'black_merchant_gift',
    'lucky_seer_check', 'lucky_witch_poison', 'younger_brother_kill', 'penguin_freeze',
    'fox_inspect', 'seer_check', 'witch_save', 'witch_poison', 'guard_protect',
    'butterfly_hug', 'stalker_assassinate', 'wolf_beauty_charm', 'nightmare_fear',
    'dreamer_dream', 'magician_swap', 'elder_silence',
  ];
  const resultDependentActionTypes = [
    'seer_check', 'lucky_seer_check', 'fox_inspect', 'black_merchant_gift',
  ];

  assert.deepEqual(NATURAL_ACTION_SPEECH_TYPES, naturalActionTypes);
  assert.ok(naturalActionTypes.every(isNaturalActionSpeechType));
  assert.equal(isNaturalActionSpeechType('day_vote'), false);
  assert.deepEqual(RESULT_DEPENDENT_ACTION_SPEECH_TYPES, resultDependentActionTypes);
  assert.ok(resultDependentActionTypes.every(isResultDependentActionSpeechType));
  assert.deepEqual(
    naturalActionTypes.filter(isResultDependentActionSpeechType).sort(),
    resultDependentActionTypes.slice().sort(),
  );
  assert.equal(isResultDependentActionSpeechType('witch_poison'), false);
  assert.equal(actionSpeechContract('day_vote'), '');
});

test('action speech contract constrains only the reason inside a structured response', () => {
  const contract = actionSpeechContract('witch_poison');

  assert.match(contract, /外层.*JSON/);
  assert.match(contract, /reason.*第一人称.*一句/);
  assert.match(contract, /reason.*Markdown.*系统旁白.*JSON 内容/);
  assert.doesNotMatch(contract, /不要输出 JSON/);
});

test('action speech policy detects effective payloads', () => {
  assert.equal(isEffectiveActionPayload({ use: true }), true);
  assert.equal(isEffectiveActionPayload({ use: false, target: 5 }), false);
  assert.equal(isEffectiveActionPayload({ target: 5 }), true);
  assert.equal(isEffectiveActionPayload({ targetId: 5 }), true);
  assert.equal(isEffectiveActionPayload({ partnerId: 3, witnessId: 4 }), true);
  assert.equal(isEffectiveActionPayload({ target: null }), false);
});

test('action speech prompt includes authoritative result without granting rule authority', () => {
  const prompt = buildActionSpeechPrompt({
    actionType: 'seer_check',
    actorLabel: '2号预言家',
    actionSummary: '查验5号',
    decisionReason: '5号发言前后矛盾',
    resolvedFact: '服务端查验结果：5号是狼人',
  });
  assert.match(prompt, /5号是狼人/);
  assert.match(prompt, /不得修改目标或结果/);
  assert.match(prompt, /只输出一句/);
  assert.match(prompt, /不要 Markdown、系统说明或 JSON/);
});

test('action speech selection prefers generated then existing then fallback', () => {
  assert.equal(resolveActionSpeech('原始理由', '模型完整台词', '固定结果'), '模型完整台词');
  assert.equal(resolveActionSpeech('原始理由', '', '固定结果'), '原始理由');
  assert.equal(resolveActionSpeech('', '', '固定结果'), '固定结果');
  assert.equal(resolveActionSpeech('', '  很长的台词  ', '固定结果'), '很长的台词');
});

test('result-dependent action speech asks once with the server-resolved fact', async () => {
  const prompts: string[] = [];
  const options: unknown[] = [];
  const actor = {
    id: 2,
    roleLabel: '预言家',
    playerAgent: {
      askTextOnce: async (prompt: string, callOptions: unknown) => {
        prompts.push(prompt);
        options.push(callOptions);
        return '我查验了5号，结果是狼人，之前他的发言果然有问题。';
      },
    },
  };
  const runtime = {
    agents: [actor, { id: 5, faction: 'wolves', alive: true }],
    state: { rounds: [] },
  };

  const speech = await resolveAiActionSpeech({
    runtime: runtime as never,
    round: { night: {} } as never,
    actor: actor as never,
    actionType: 'seer_check',
    payload: { target: 5 },
  });

  assert.equal(speech, '我查验了5号，结果是狼人，之前他的发言果然有问题。');
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /5号.*狼人/);
  assert.deepEqual(options, [{ limit: 80, maxTokens: 120, skillId: 'action-speech:seer_check', phase: 'night' }]);
});

test('every result-dependent action asks once from its reducer-owned result', async () => {
  const prompts: string[] = [];
  const actor = {
    id: 2,
    roleLabel: '行动者',
    playerAgent: {
      askTextOnce: async (prompt: string) => {
        prompts.push(prompt);
        return '我已根据今晚的结果完成行动。';
      },
    },
  };
  const runtime = {
    agents: [
      actor,
      { id: 3, faction: 'good', alive: true },
      { id: 4, faction: 'good', alive: true },
      { id: 5, faction: 'wolves', alive: true },
      { id: 6, faction: 'good', alive: true },
    ],
  };
  const input = (actionType: string, payload: Record<string, unknown>) => resolveAiActionSpeech({
    runtime: runtime as never,
    round: { night: {} } as never,
    actor: actor as never,
    actionType,
    payload,
  });

  await input('seer_check', { target: 5 });
  await input('lucky_seer_check', { target: 5 });
  await input('fox_inspect', { target: 4 });
  await input('black_merchant_gift', { target: 5, gift: 'inspectFaction' });

  assert.equal(prompts.length, 4);
  assert.match(prompts[0], /5号查验结果是狼人/);
  assert.match(prompts[1], /5号查验结果是狼人/);
  assert.match(prompts[2], /3、4、5号三连查验结果有狼/);
  assert.match(prompts[3], /5号赠技结果失败/);
});

test('magician swap changes only seer action speech, not lucky seer speech', async () => {
  const prompts: string[] = [];
  const actor = {
    id: 2,
    roleLabel: '行动者',
    playerAgent: {
      askTextOnce: async (prompt: string) => {
        prompts.push(prompt);
        return '我已根据今晚的结果完成行动。';
      },
    },
  };
  const runtime = {
    agents: [
      actor,
      { id: 5, faction: 'wolves', alive: true },
      { id: 6, faction: 'good', alive: true },
    ],
  };
  const round = { night: { magicianSwap: { firstTarget: 5, secondTarget: 6 } } };

  await resolveAiActionSpeech({ runtime: runtime as never, round: round as never, actor: actor as never, actionType: 'seer_check', payload: { target: 5 } });
  await resolveAiActionSpeech({ runtime: runtime as never, round: round as never, actor: actor as never, actionType: 'lucky_seer_check', payload: { target: 5 } });

  assert.equal(prompts.length, 2);
  assert.match(prompts[0], /5号查验结果是好人/);
  assert.match(prompts[1], /5号查验结果是狼人/);
});

test('effective action speech keeps its existing reason without another model call', async () => {
  let calls = 0;
  const actor = {
    id: 2,
    roleLabel: '女巫',
    playerAgent: {
      askTextOnce: async () => {
        calls += 1;
        return '不应调用';
      },
    },
  };

  const speech = await resolveAiActionSpeech({
    runtime: { agents: [actor] } as never,
    round: { night: {} } as never,
    actor: actor as never,
    actionType: 'witch_poison',
    payload: { use: true, target: 5, reason: '  我判断5号最可疑。  ' },
  });

  assert.equal(speech, '我判断5号最可疑。');
  assert.equal(calls, 0);
});

test('failed action speech generation leaves deterministic fallback to the phase builder', async () => {
  const actor = {
    id: 2,
    roleLabel: '预言家',
    playerAgent: {
      askTextOnce: async () => null,
    },
  };

  const speech = await resolveAiActionSpeech({
    runtime: { agents: [actor, { id: 5, faction: 'wolves', alive: true }] } as never,
    round: { night: {} } as never,
    actor: actor as never,
    actionType: 'seer_check',
    payload: { target: 5 },
  });

  assert.equal(speech, '');
});

test('skipped action speech does not call the model', async () => {
  let calls = 0;
  const actor = {
    id: 2,
    playerAgent: {
      askTextOnce: async () => {
        calls += 1;
        return '不应调用';
      },
    },
  };

  const speech = await resolveAiActionSpeech({
    runtime: { agents: [actor] } as never,
    round: { night: {} } as never,
    actor: actor as never,
    actionType: 'witch_poison',
    payload: { use: false },
  });

  assert.equal(speech, '');
  assert.equal(calls, 0);
});

test('effective decision action without a reason does not make a correction call', async () => {
  let calls = 0;
  const actor = {
    id: 2,
    playerAgent: {
      askTextOnce: async () => {
        calls += 1;
        return '我决定毒5号。';
      },
    },
  };

  const speech = await resolveAiActionSpeech({
    runtime: { agents: [actor] } as never,
    round: { night: {} } as never,
    actor: actor as never,
    actionType: 'witch_poison',
    payload: { use: true, target: 5 },
  });

  assert.equal(speech, '');
  assert.equal(calls, 0);
});

test('decision action rejects a reason that omits its authoritative target', async () => {
  let calls = 0;
  const actor = {
    id: 2,
    playerAgent: {
      askTextOnce: async () => {
        calls += 1;
        return '不应调用';
      },
    },
  };

  const speech = await resolveAiActionSpeech({
    runtime: { agents: [actor] } as never,
    round: { night: {} } as never,
    actor: actor as never,
    actionType: 'witch_poison',
    payload: { use: true, target: 5, reason: '我决定毒2号。' },
  });

  assert.equal(speech, '');
  assert.equal(calls, 0);
});

test('witch save speech uses the server-resolved night attack target without a correction call', async () => {
  let calls = 0;
  const actor = {
    id: 2,
    playerAgent: {
      askTextOnce: async () => {
        calls += 1;
        return '不应调用';
      },
    },
  };
  const cases = [
    { night: { wolfTarget: 5 }, reason: '我决定救5号。', expected: '我决定救5号。' },
    { night: { wolfTarget: 5 }, reason: '我决定救2号。', expected: '' },
    { night: {}, reason: '我决定救5号。', expected: '' },
  ];
  const actual: string[] = [];

  for (const item of cases) {
    actual.push(await resolveAiActionSpeech({
      runtime: { agents: [actor] } as never,
      round: { night: item.night } as never,
      actor: actor as never,
      actionType: 'witch_save',
      payload: { use: true, reason: item.reason },
    }));
  }

  assert.deepEqual(actual, cases.map((item) => item.expected));
  assert.equal(calls, 0);
});

test('result action rejects generated speech that omits its authoritative target', async () => {
  let calls = 0;
  const actor = {
    id: 2,
    playerAgent: {
      askTextOnce: async () => {
        calls += 1;
        return '我查验了2号，他果然有问题。';
      },
    },
  };

  const speech = await resolveAiActionSpeech({
    runtime: { agents: [actor, { id: 5, faction: 'wolves', alive: true }] } as never,
    round: { night: {} } as never,
    actor: actor as never,
    actionType: 'seer_check',
    payload: { target: 5 },
  });

  assert.equal(speech, '');
  assert.equal(calls, 1);
});

test('action speech target validation covers aliases and every multi-target seat', () => {
  assert.equal(normalizeActionSpeechForPayload('witch_poison', { use: true, target: 5 }, '  我怀疑2号，所以决定毒5号。  '), '我怀疑2号，所以决定毒5号。');
  assert.equal(normalizeActionSpeechForPayload('guard_protect', { targetSeat: 6 }, '我守护6号。'), '我守护6号。');
  assert.equal(normalizeActionSpeechForPayload('crow_curse', { targetId: 7 }, '我诅咒7号。'), '我诅咒7号。');
  assert.equal(normalizeActionSpeechForPayload('magician_swap', { firstTarget: 2, secondTarget: 5 }, '我交换2号和5号。'), '我交换2号和5号。');
  assert.equal(normalizeActionSpeechForPayload('magician_swap', { target: 2, secondTargetSeat: 5 }, '我只提到2号。'), '');
  assert.equal(normalizeActionSpeechForPayload('ghost_bride_link', { partnerId: 3, witnessId: 4 }, '我选择3号和4号。'), '我选择3号和4号。');
  assert.equal(normalizeActionSpeechForPayload('witch_poison', { use: true, target: 5 }, '我决定毒15号。'), '');
});

test('out-of-scope action window leaves the action payload untouched', async (t) => {
  const memoryDb: DbExecutor = {
    queryOne: async () => null,
    queryMany: async () => [],
    execute: async () => ({ rowCount: 0 }),
    withTransaction: async (operation) => operation(memoryDb),
    healthCheck: async () => true,
    close: async () => {},
  };
  setDbExecutorForTests(memoryDb);
  t.after(() => setDbExecutorForTests(null));
  const prototype = BasePlayerAgent.prototype as unknown as {
    askVoteTarget: (...args: unknown[]) => Promise<number | null>;
  };
  const originalAskVoteTarget = prototype.askVoteTarget;
  prototype.askVoteTarget = async () => 2;
  const roleConfig = { id: 'villager', name: '平民', faction: 'good', rule: { actions: [] } };
  const players = [
    { id: 1, sourcePlayerId: 1, role: 'villager', roleConfig, alive: true, canVote: true },
    { id: 2, sourcePlayerId: 2, role: 'villager', roleConfig, alive: true, canVote: true },
  ];
  const match = {
    id: `action-speech-out-of-scope-${Date.now()}`,
    config: { players },
    state: {
      modeConfig: { id: 'test', name: 'test', roles: [], roleMap: {}, sheriff: {}, winCondition: 'side' },
      players,
      rounds: [createRound(1)],
    },
  };

  try {
    const result = await runActionWindowAiTask({
      match: match as never,
      step: { id: 'day_vote_1', config: { day: 1, phase: 'day', actionType: 'day_vote' } },
      task: { playerId: 1 },
    });

    assert.deepEqual(result.rawOutput, { target: 2 });
    assert.equal(Object.hasOwn(result.rawOutput as object, 'reason'), false);
    assert.equal(Object.hasOwn(result.payload, 'reason'), false);
  } finally {
    prototype.askVoteTarget = originalAskVoteTarget;
  }
});
