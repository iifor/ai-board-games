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
  resolveActionSpeech,
} from '../../packages/server/modules/werewolf/actionSpeech';

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
