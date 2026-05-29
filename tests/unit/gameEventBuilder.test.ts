import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameEventBuilder } from '../../packages/server/modules/werewolf/gameEventBuilder';
import type { SerializedGameState } from '../../packages/shared/types/gameEvent';

test('GameEventBuilder - 基本事件构建', () => {
  const builder = createGameEventBuilder('match-001');

  // 设置上下文
  builder.setPhase('night').setDay(1).setStep('wolf_speech_1');

  // 构建事件
  const event = builder.build(
    'phase-start',
    { phase: 'night', message: '天黑请闭眼' },
    'public'
  );

  // 验证
  assert.ok(event.id, '事件应有 id');
  assert.equal(event.type, 'phase-start');
  assert.equal(event.channel, 'public');
  assert.equal(event.metadata.matchId, 'match-001');
  assert.equal(event.metadata.phase, 'night');
  assert.equal(event.metadata.day, 1);
  assert.equal(event.metadata.stepId, 'wolf_speech_1');
  assert.ok(event.metadata.timestamp, '事件应有时间戳');
  assert.ok(event.metadata.sequence > 0, '事件应有序列号');
  assert.ok(event.presentation, '事件应有播报信息');
});

test('GameEventBuilder - 阶段事件构建', () => {
  const builder = createGameEventBuilder('match-001');
  builder.setPhase('night').setDay(1);

  const event = builder.buildPhaseStart('night', '天黑请闭眼');

  assert.equal(event.type, 'phase-start');
  assert.equal(event.payload.phase, 'night');
  assert.equal(event.payload.message, '天黑请闭眼');
  assert.equal(event.channel, 'public');
});

test('GameEventBuilder - 行动请求事件', () => {
  const builder = createGameEventBuilder('match-001');
  builder.setPhase('night').setDay(1).setStep('wolf_speech_1');

  const event = builder.buildActionRequested('wolf_speech', [1, 2, 3], {
    actionWindow: { id: 'window-1' }
  });

  assert.equal(event.type, 'action-requested');
  assert.equal(event.payload.actionType, 'wolf_speech');
  assert.deepEqual(event.payload.actorIds, [1, 2, 3]);
  assert.equal(event.channel, 'scope');
  assert.equal(event.scopeKey, 'wolves');
});

test('GameEventBuilder - 发言事件', () => {
  const builder = createGameEventBuilder('match-001');
  builder.setPhase('night').setDay(1);

  const event = builder.buildSpeech({
    playerId: 1,
    text: '我是好人',
    thinking: '需要隐藏身份'
  });

  assert.equal(event.type, 'speech');
  assert.equal(event.payload.playerId, 1);
  assert.equal(event.payload.text, '我是好人');
  assert.equal(event.payload.thinking, '需要隐藏身份');
  assert.equal(event.channel, 'public');
});

test('GameEventBuilder - 狼人发言事件', () => {
  const builder = createGameEventBuilder('match-001');
  builder.setPhase('night').setDay(1);

  const event = builder.buildWolfSpeech({
    playerId: 1,
    text: '今晚刀 4 号',
    isLeader: true
  });

  assert.equal(event.type, 'wolf-speech');
  assert.equal(event.payload.playerId, 1);
  assert.equal(event.payload.text, '今晚刀 4 号');
  assert.equal(event.channel, 'scope');
  assert.equal(event.scopeKey, 'wolves');
});

test('GameEventBuilder - Skill 事件', () => {
  const builder = createGameEventBuilder('match-001');
  builder.setPhase('night').setDay(1);

  // Skill 请求
  const requested = builder.buildSkillRequested('kill', 1, { target: 4 });
  assert.equal(requested.type, 'skill-requested');
  assert.equal(requested.payload.skillId, 'kill');
  assert.equal(requested.payload.actorId, 1);
  assert.equal(requested.channel, 'system');

  // Skill 思考
  const thinking = builder.buildSkillThinking('kill', 1, '分析局势...');
  assert.equal(thinking.type, 'skill-thinking');
  assert.equal(thinking.payload.thinking, '分析局势...');

  // Skill 完成
  const completed = builder.buildSkillCompleted('kill', 1, { target: 4 }, 150);
  assert.equal(completed.type, 'skill-completed');
  assert.equal(completed.payload.duration, 150);
});

test('GameEventBuilder - 夜晚结果事件', () => {
  const builder = createGameEventBuilder('match-001');
  builder.setPhase('night').setDay(1);

  const event = builder.buildNightResult(
    [{ id: 4, reason: '狼人袭击' }],
    '昨晚 4 号死亡'
  );

  assert.equal(event.type, 'night-result');
  assert.equal(event.payload.deaths.length, 1);
  assert.equal(event.payload.deaths[0].id, 4);
  assert.equal(event.payload.message, '昨晚 4 号死亡');
});

test('GameEventBuilder - 投票结果事件', () => {
  const builder = createGameEventBuilder('match-001');
  builder.setPhase('day').setDay(1);

  const event = builder.buildVoteResult(
    { 1: 2, 3: 4 },
    { 1: 2, 3: 4 },
    { id: 3, reason: '放逐' },
    '3 号被放逐'
  );

  assert.equal(event.type, 'vote-result');
  assert.deepEqual(event.payload.votes, { 1: 2, 3: 4 });
  assert.equal(event.payload.exile?.id, 3);
});

test('GameEventBuilder - 警长事件', () => {
  const builder = createGameEventBuilder('match-001');
  builder.setPhase('day').setDay(1);

  const event = builder.buildSheriffEvent('sheriff-start', {
    election: { candidates: [1, 2, 3] },
    message: '警长竞选开始'
  });

  assert.equal(event.type, 'sheriff-start');
  assert.deepEqual(event.payload.election?.candidates, [1, 2, 3]);
});

test('GameEventBuilder - 错误事件', () => {
  const builder = createGameEventBuilder('match-001');

  const event = builder.buildError('INVALID_ACTION', '无效的行动', { action: 'test' });

  assert.equal(event.type, 'error');
  assert.equal(event.payload.code, 'INVALID_ACTION');
  assert.equal(event.payload.message, '无效的行动');
  assert.equal(event.channel, 'system');
});

test('GameEventBuilder - 游戏快照', () => {
  const builder = createGameEventBuilder('match-001');

  const mockGame: SerializedGameState = {
    id: 'match-001',
    gameType: 'werewolf',
    type: 'werewolf',
    mode: 'real',
    debugMode: false,
    clientViewMode: 'god',
    host: { id: 0, name: 'host' },
    werewolfMode: { id: 'standard', name: '标准局' },
    players: [],
    rounds: [],
    winner: null,
    winReason: '',
    fallbackAudit: [],
    currentActionWindow: null,
    createdAt: new Date().toISOString()
  };

  builder.setGame(mockGame);
  const event = builder.buildPhaseStart('night', '天黑请闭眼');

  assert.ok(event.game, '事件应包含游戏快照');
  assert.equal(event.game?.id, 'match-001');
});

test('GameEventBuilder - 序列号递增', () => {
  const builder = createGameEventBuilder('match-001');
  builder.setPhase('night').setDay(1);

  const event1 = builder.buildPhaseStart('night', '天黑请闭眼');
  const event2 = builder.buildPhaseStart('night', '天黑请闭眼');

  assert.equal(event2.metadata.sequence, event1.metadata.sequence + 1);
});

test('GameEventBuilder - 频道路由', () => {
  const builder = createGameEventBuilder('match-001');
  builder.setPhase('night').setDay(1);

  // 狼人行动 → scope:wolves
  const wolfEvent = builder.buildActionRequested('wolf_speech', [1, 2]);
  assert.equal(wolfEvent.channel, 'scope');
  assert.equal(wolfEvent.scopeKey, 'wolves');

  // 预言家行动 → scope:seer
  const seerEvent = builder.buildActionRequested('seer_check', [3]);
  assert.equal(seerEvent.channel, 'scope');
  assert.equal(seerEvent.scopeKey, 'seer');

  // 白天发言 → public
  const speechEvent = builder.buildActionRequested('day_speech', [1, 2, 3]);
  assert.equal(speechEvent.channel, 'public');
});
