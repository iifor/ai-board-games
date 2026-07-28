import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actionSpeechContract,
  buildActionSpeechPrompt,
  isEffectiveActionPayload,
  isNaturalActionSpeechType,
  isResultDependentActionSpeechType,
  resolveActionSpeech,
} from '../../packages/server/modules/werewolf/actionSpeech';

test('action speech policy scopes natural and result-dependent actions', () => {
  assert.equal(isNaturalActionSpeechType('witch_save'), true);
  assert.equal(isNaturalActionSpeechType('day_vote'), false);
  assert.equal(isResultDependentActionSpeechType('seer_check'), true);
  assert.equal(isResultDependentActionSpeechType('witch_poison'), false);
  assert.match(actionSpeechContract('witch_poison'), /第一人称/);
  assert.equal(actionSpeechContract('day_vote'), '');
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
});

test('action speech selection prefers generated then existing then fallback', () => {
  assert.equal(resolveActionSpeech('原始理由', '模型完整台词', '固定结果'), '模型完整台词');
  assert.equal(resolveActionSpeech('原始理由', '', '固定结果'), '原始理由');
  assert.equal(resolveActionSpeech('', '', '固定结果'), '固定结果');
  assert.equal(resolveActionSpeech('', '  很长的台词  ', '固定结果'), '很长的台词');
});
