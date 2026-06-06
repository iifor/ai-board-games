import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWerewolfPresentation } from '../../packages/server/modules/werewolf/presentation';

test('werewolf presentation shortens night start narration', () => {
  const presentation = resolveWerewolfPresentation({
    workflowEvent: 'werewolf_phase_changed',
    stepId: 'night_start_1',
    message: '第1夜开始，天黑请闭眼。'
  });

  assert.equal(presentation.speakableText, '天黑请闭眼');
  assert.equal(presentation.displayText, '天黑请闭眼');
  assert.equal(presentation.suppressSpeech, false);
});

test('werewolf presentation keeps wolf vote as UI state instead of narration', () => {
  const requested = resolveWerewolfPresentation({
    workflowEvent: 'werewolf_action_requested',
    actionType: 'wolf_vote',
    stepId: 'wolf_vote_1',
    message: '第1夜狼人统一刀口投票。'
  });
  const resolved = resolveWerewolfPresentation({
    workflowEvent: 'werewolf_action_submitted',
    actionType: 'wolf_vote',
    stepId: 'wolf_vote_1',
    message: '第1天狼人刀口投票行动已完成。'
  });

  assert.equal(requested.suppressSpeech, true);
  assert.equal(requested.displayText, '狼队投票中');
  assert.equal(resolved.speakableText, '狼人请闭眼');
  assert.equal(resolved.displayText, '狼人请闭眼');
});

test('werewolf presentation preserves player performance text', () => {
  const speech = resolveWerewolfPresentation({
    eventType: 'speech',
    actionType: 'day_speech',
    speechText: '我认为3号的逻辑有断点。'
  });
  const selfDestruct = resolveWerewolfPresentation({
    eventType: 'self-destruct',
    workflowEvent: 'werewolf_self_destruct',
    speechText: '我自爆，今晚见。'
  });

  assert.equal(speech.speakableText, '我认为3号的逻辑有断点。');
  assert.equal(speech.uiHint, 'player-speech');
  assert.equal(selfDestruct.speakableText, '我自爆，今晚见。');
  assert.equal(selfDestruct.uiHint, 'self-destruct');
});

test('werewolf presentation keeps skipped poison visible without speech or ack', () => {
  const result = resolveWerewolfPresentation({
    workflowEvent: 'witch-action',
    eventType: 'witch-action',
    actionType: 'witch_poison',
    actionUsed: false,
  });

  assert.equal(result.displayText, '女巫没有使用毒药');
  assert.equal(result.speakableText, '');
  assert.equal(result.suppressSpeech, true);
  assert.equal(result.requiresAck, false);
});
