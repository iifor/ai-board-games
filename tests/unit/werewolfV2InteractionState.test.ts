import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getWerewolfInteractionAnimationKey, getWerewolfInteractionStatusText, getWerewolfInteractionVisualKind, resolveNightAwakeLabel, resolveWerewolfActiveSubtitle, resolveWerewolfInteraction, resolveWerewolfSpeechSpeaker, shouldProjectWerewolfInteraction, shouldShowWerewolfStageDetails } from '../../packages/client/src/features/werewolf-v2/utils/interactionState';

test('werewolf v2 maps core actions to distinct role visuals', () => {
  assert.equal(getWerewolfInteractionVisualKind('wolf_vote'), 'wolf');
  assert.equal(getWerewolfInteractionVisualKind('seer_check'), 'seer');
  assert.equal(getWerewolfInteractionVisualKind('witch_poison'), 'witch');
  assert.equal(getWerewolfInteractionVisualKind('guard_protect'), 'guard');
  assert.equal(getWerewolfInteractionVisualKind('hunter_shot'), 'hunter');
  assert.equal(getWerewolfInteractionVisualKind('self_destruct'), 'self-destruct');
  assert.equal(getWerewolfInteractionVisualKind('knight_duel'), 'knight');
  assert.equal(getWerewolfInteractionVisualKind('idiot_reveal'), 'idiot');
  assert.equal(getWerewolfInteractionVisualKind('sheriff_vote'), 'sheriff');
  assert.equal(getWerewolfInteractionVisualKind('future_skill'), 'generic');
  assert.equal(getWerewolfInteractionVisualKind(''), 'none');
});

test('werewolf v2 exposes only event-backed skill result labels', () => {
  assert.equal(resolveWerewolfInteraction({ type: 'seer-check', actionType: 'seer_check', seerCheck: { target: 4, result: '狼人' } }).resultLabel, '查验结果：狼人');
  assert.equal(resolveWerewolfInteraction({ type: 'guard-action', actionType: 'guard_protect', guardAction: { target: 6 } }).resultLabel, '守护生效');
  assert.equal(resolveWerewolfInteraction({ type: 'witch-action', actionType: 'witch_poison', witchAction: { use: true, target: 9 } }).resultLabel, '毒药已使用');
  assert.equal(resolveWerewolfInteraction({ type: 'witch-action', actionType: 'witch_poison', witchAction: { use: false, target: null } }).resultLabel, '保留药剂');
  assert.equal(resolveWerewolfInteraction({ type: 'knight-duel', actionType: 'knight_duel', knightDuel: { actorId: 4, targetId: 9, success: true } }).resultLabel, '决斗成功');
  assert.equal(resolveWerewolfInteraction({ type: 'workflow-event', actionType: 'future_skill' }).resultLabel, '');
});

test('werewolf v2 renders the approved visual stage and public seat badges', () => {
  const stage = readFileSync('packages/client/src/features/werewolf-v2/components/PerspectiveShared/index.tsx', 'utf8');
  const roleVisual = readFileSync('packages/client/src/features/werewolf-v2/components/RoleInteractionVisual/index.tsx', 'utf8');
  assert.match(stage, /RoleInteractionVisual/);
  assert.match(roleVisual, /interaction\.template === 'idle'/);
  for (const label of ['发言中', '警长候选', '警长', '已退水', '已翻牌', '已出局']) {
    assert.match(stage, new RegExp(label));
  }
});

test('werewolf v2 omits the redundant stage status row', () => {
  const stage = readFileSync('packages/client/src/features/werewolf-v2/components/PerspectiveShared/index.tsx', 'utf8');
  assert.doesNotMatch(stage, /interaction-stage__status|<Activity|getWerewolfInteractionStatusText/);
});

test('werewolf v2 hides duplicate center details while a player is speaking', () => {
  assert.equal(shouldShowWerewolfStageDetails({ template: 'speech' }), false);
  assert.equal(shouldShowWerewolfStageDetails({ template: 'single-target' }), true);
});

test('werewolf v2 keeps spoken copy in the bottom bar only', () => {
  const stage = readFileSync('packages/client/src/features/werewolf-v2/components/PerspectiveShared/index.tsx', 'utf8');
  const bottomBar = readFileSync('packages/client/src/features/werewolf-v2/components/WerewolfBottomSpeechBar/index.tsx', 'utf8');

  assert.doesNotMatch(stage, /resolveWerewolfStageNarrative|interaction-stage__narrative|interaction-stage__speaker/);
  assert.match(bottomBar, /resolveWerewolfSpeechSpeaker/);
  assert.match(bottomBar, /PlayerAvatar/);
});

test('werewolf v2 subtitle follows the active speech cue instead of showing the full speech', () => {
  const speech = {
    text: '第一句正在播放，内容足够清楚。第二句随后播放，不能提前展示。',
    wordBoundaries: [
      { text: '第一句正在播放', offset: 0, duration: 800 },
      { text: '，', offset: 800, duration: 80 },
      { text: '内容足够清楚', offset: 880, duration: 800 },
      { text: '。', offset: 1680, duration: 80 },
      { text: '第二句随后播放', offset: 2200, duration: 800 },
      { text: '，', offset: 3000, duration: 80 },
      { text: '不能提前展示', offset: 3080, duration: 800 },
      { text: '。', offset: 3880, duration: 80 },
    ],
  };

  assert.equal(resolveWerewolfActiveSubtitle({ ...speech, currentTimeMs: 900 }), '第一句正在播放，内容足够清楚。');
  assert.equal(resolveWerewolfActiveSubtitle({ ...speech, currentTimeMs: 3200 }), '第二句随后播放，不能提前展示。');
  assert.equal(resolveWerewolfActiveSubtitle({ text: speech.text, wordBoundaries: null, currentTimeMs: null }), '第一句正在播放，内容足够清楚。');
});

test('werewolf result opens MVP vote records by default', () => {
  const source = readFileSync('packages/client/src/features/werewolf/components/WerewolfResult/index.tsx', 'utf8');
  assert.match(source, /<details className="werewolf-result-votes" open>/);
  assert.doesNotMatch(source, /open=\{!game\.mvp\}/);
});

test('werewolf v2 does not restart the stage animation for transient updates in one action', () => {
  const acting = resolveWerewolfInteraction({
    type: 'workflow-event',
    workflowEvent: 'werewolf_action_window_opened',
    actionType: 'wolf_vote',
    actionWindow: { actorIds: [1, 2], targetIds: [4, 5] },
  });
  const resolved = resolveWerewolfInteraction({
    type: 'wolf-vote',
    actionType: 'wolf_vote',
    wolfTarget: 5,
  });

  assert.equal(getWerewolfInteractionAnimationKey(acting), getWerewolfInteractionAnimationKey(resolved));
});

test('werewolf v2 keeps technical and narration-only events out of the foreground stage', () => {
  assert.equal(shouldProjectWerewolfInteraction({ type: 'workflow-state', message: 'state synchronized' }), false);
  assert.equal(shouldProjectWerewolfInteraction({ type: 'phase-start', narration: 'day begins' }), false);
  assert.equal(shouldProjectWerewolfInteraction({
    type: 'workflow-event',
    workflowEvent: 'werewolf_action_submitted',
    actionType: 'wolf_vote',
  }), true);
  assert.equal(shouldProjectWerewolfInteraction({
    type: 'speech',
    actionType: 'day_speech',
    speech: { playerId: 2, text: 'statement' },
  }), true);
  assert.equal(shouldProjectWerewolfInteraction({
    type: 'workflow-event',
    workflowEvent: 'werewolf_action_skipped',
    actionType: 'ghost_bride_link',
  }), false);
});

test('werewolf v2 resolves the speaking player for the stage identity', () => {
  const players = [{ id: 1, nickname: '豆包' }, { id: 2, nickname: 'Grok' }];
  assert.deepEqual(resolveWerewolfSpeechSpeaker({ playerId: '2' }, players), players[1]);
  assert.equal(resolveWerewolfSpeechSpeaker({ playerId: null }, players), null);
  assert.equal(resolveWerewolfSpeechSpeaker({ playerId: '9' }, players), null);
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
  assert.deepEqual(wolf.targetIds, []);

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
