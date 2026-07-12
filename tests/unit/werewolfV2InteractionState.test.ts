import test from 'node:test';
import assert from 'node:assert/strict';
import { getWerewolfInteractionStatusText, resolveNightAwakeLabel, resolveWerewolfInteraction, resolveWerewolfSpeechSpeaker, resolveWerewolfStageNarrative } from '../../packages/client/src/features/werewolf-v2/utils/interactionState';

test('werewolf v2 resolves the speaking player for the stage identity', () => {
  const players = [{ id: 1, nickname: '豆包' }, { id: 2, nickname: 'Grok' }];
  assert.deepEqual(resolveWerewolfSpeechSpeaker({ playerId: '2' }, players), players[1]);
  assert.equal(resolveWerewolfSpeechSpeaker({ playerId: null }, players), null);
  assert.equal(resolveWerewolfSpeechSpeaker({ playerId: '9' }, players), null);
});

test('werewolf v2 stage prefers thinking and falls back to subtitle', () => {
  assert.deepEqual(
    resolveWerewolfStageNarrative({ thinking: '先判断狼队目标。', fullText: '公开发言。' }, '阶段信息'),
    { kind: 'thinking', label: '思考过程', text: '先判断狼队目标。' },
  );
  assert.deepEqual(
    resolveWerewolfStageNarrative({ thinking: '  ', fullText: '完整字幕。', text: '当前字幕。' }, '阶段信息'),
    { kind: 'subtitle', label: '发言内容', text: '完整字幕。' },
  );
  assert.deepEqual(
    resolveWerewolfStageNarrative(null, '阶段信息'),
    { kind: 'status', label: '', text: '阶段信息' },
  );
});

test('werewolf v2 keeps submitted as an internal state without exposing submission copy', () => {
  assert.equal(getWerewolfInteractionStatusText('submitted'), '正在行动');
  const submitted = resolveWerewolfInteraction({
    type: 'workflow-event',
    workflowEvent: 'werewolf_action_submitted',
    actionType: 'wolf_vote',
  });
  assert.equal(submitted.status, 'submitted');
  assert.equal(submitted.detail, '正在行动');
});

test('werewolf v2 names the active night group without inventing game state', () => {
  assert.equal(resolveNightAwakeLabel(''), '天黑请闭眼');
  assert.equal(resolveNightAwakeLabel('game_started'), '天黑请闭眼');
  assert.equal(resolveNightAwakeLabel('wolf_vote'), '狼队睁眼');
  assert.equal(resolveNightAwakeLabel('seer_check'), '预言家睁眼');
  assert.equal(resolveNightAwakeLabel('witch_save'), '女巫睁眼');
  assert.equal(resolveNightAwakeLabel('guard_protect'), '守卫睁眼');
  assert.equal(resolveNightAwakeLabel('demon_inspect'), '夜间角色睁眼');
});

test('werewolf v2 resolves core AI interaction states', () => {
  const wolf = resolveWerewolfInteraction({
    type: 'workflow-event',
    workflowEvent: 'werewolf_action_window_opened',
    actionType: 'wolf_vote',
    actionWindow: { actorIds: [1, 2], targetIds: [4, 5] },
  });
  assert.equal(wolf.template, 'single-target');
  assert.equal(wolf.status, 'acting');
  assert.deepEqual(wolf.actorIds, [1, 2]);

  const seer = resolveWerewolfInteraction({
    type: 'seer-check',
    actionType: 'seer_check',
    seerCheck: { target: 4, result: '狼人' },
  });
  assert.equal(seer.template, 'result-reveal');
  assert.equal(seer.status, 'resolved');
  assert.deepEqual(seer.targetIds, [4]);

  const skipped = resolveWerewolfInteraction({
    type: 'workflow-event',
    workflowEvent: 'werewolf_action_skipped',
    actionType: 'witch_poison',
    message: '毒药已用完',
  });
  assert.equal(skipped.status, 'skipped');
  assert.equal(skipped.tone, 'witch');

  const guard = resolveWerewolfInteraction({ type: 'guard-action', actionType: 'guard_protect', guardAction: { target: 6 } });
  assert.equal(guard.status, 'resolved');
  assert.deepEqual(guard.targetIds, [6]);

  const witch = resolveWerewolfInteraction({ type: 'witch-action', actionType: 'witch_poison', witchAction: { use: true, target: 9 } });
  assert.equal(witch.status, 'resolved');
  assert.deepEqual(witch.targetIds, [9]);

  const wolfResult = resolveWerewolfInteraction({ type: 'wolf-vote', actionType: 'wolf_vote', wolfTarget: 7 });
  assert.equal(wolfResult.status, 'resolved');
  assert.deepEqual(wolfResult.targetIds, [7]);
});

test('werewolf v2 resolves sheriff, vote, speech and day skills', () => {
  assert.equal(resolveWerewolfInteraction({ type: 'sheriff-signup' }).template, 'binary-choice');
  assert.equal(resolveWerewolfInteraction({ type: 'sheriff-speech', speech: { playerId: 3, text: '竞选发言' } }).template, 'speech');

  const vote = resolveWerewolfInteraction({
    type: 'workflow-event',
    workflowEvent: 'vote-result',
    votes: { 1: 4, 2: 4 },
    tally: { 4: 2 },
    exile: { id: 4 },
  });
  assert.equal(vote.template, 'result-reveal');
  assert.equal(vote.status, 'resolved');
  assert.deepEqual(vote.targetIds, [4]);

  const hunter = resolveWerewolfInteraction({ type: 'hunter-shot', shot: { from: 5, target: 2 } });
  assert.equal(hunter.template, 'passive-trigger');
  assert.deepEqual(hunter.actorIds, [5]);
  assert.deepEqual(hunter.targetIds, [2]);

  const daySpeech = resolveWerewolfInteraction({ type: 'speech', actionType: 'day_speech', speech: { playerId: 7, text: '发言' } });
  assert.equal(daySpeech.template, 'speech');
  assert.deepEqual(daySpeech.actorIds, [7]);
});

test('werewolf v2 resolves extended role skill titles and targets', () => {
  const charm = resolveWerewolfInteraction({
    type: 'wolf-beauty-charm',
    actionType: 'wolf_beauty_charm',
    wolfBeautyTarget: 8,
  });
  assert.equal(charm.title, '狼美人魅惑');
  assert.equal(charm.status, 'resolved');
  assert.deepEqual(charm.targetIds, [8]);

  const duel = resolveWerewolfInteraction({
    type: 'knight-duel',
    actionType: 'knight_duel',
    knightDuel: { actorId: 4, targetId: 9, success: true },
  });
  assert.equal(duel.title, '骑士决斗');
  assert.deepEqual(duel.actorIds, [4]);
  assert.deepEqual(duel.targetIds, [9]);
});

test('werewolf v2 falls back to generic templates without inventing targets', () => {
  const dual = resolveWerewolfInteraction({
    type: 'workflow-event',
    workflowEvent: 'werewolf_action_submitted',
    actionType: 'magician_swap',
    magicianSwap: { firstTarget: 2, secondTarget: 8 },
  });
  assert.equal(dual.template, 'dual-target');
  assert.deepEqual(dual.targetIds, [2, 8]);

  const unknown = resolveWerewolfInteraction({ type: 'workflow-event', actionType: 'future_skill' });
  assert.equal(unknown.template, 'idle');
  assert.deepEqual(unknown.targetIds, []);
});
