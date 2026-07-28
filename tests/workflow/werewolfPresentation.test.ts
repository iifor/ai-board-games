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

test('werewolf presentation keeps natural action speech unchanged', () => {
  const speech = '我今晚守护2号，他很可能是关键神职。';
  const presentation = resolveWerewolfPresentation({
    workflowEvent: 'werewolf_phase_result',
    eventType: 'guard-action',
    actionType: 'guard_protect',
    message: speech,
  });

  assert.equal(presentation.speakableText, speech);
  assert.equal(presentation.displayText, speech);
  assert.equal(presentation.suppressSpeech, false);
});

test('werewolf presentation keeps MVP ballots silent and announces the result', () => {
  const start = resolveWerewolfPresentation({
    eventType: 'mvp-start',
    message: '现在进行MVP评选，请评选本局MVP。',
  });
  const ballot = resolveWerewolfPresentation({
    eventType: 'mvp-vote',
    actionType: 'mvp_vote',
    message: '1号投给3号',
  });
  const result = resolveWerewolfPresentation({
    eventType: 'mvp-result',
    message: '本场MVP是3号玩家，获得4票。',
  });
  const speech = resolveWerewolfPresentation({
    eventType: 'speech',
    actionType: 'postgame_speech',
    speechText: '感谢大家，这局很精彩。',
  });

  assert.equal(ballot.suppressSpeech, true);
  assert.equal(start.speakableText, '现在进行MVP评选，请评选本局MVP。');
  assert.equal(ballot.speakableText, '');
  assert.equal(result.speakableText, '本场MVP是3号玩家，获得4票。');
  assert.equal(speech.speakableText, '感谢大家，这局很精彩。');
  assert.equal(speech.uiHint, 'postgame-speech');
});
