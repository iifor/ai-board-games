/**
 * Phase 0: 事件映射验证测试
 * 验证 GameEvent ↔ legacy workflow event 之间的映射不丢失字段
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameEventBuilder } from '../../packages/server/modules/werewolf/gameEventBuilder';
import { resolveActionChannel } from '../../packages/server/modules/werewolf/handlers/actionChannel';
import { getChannelForRole } from '../../packages/server/modules/werewolf/channelRouter';

// ============================================================
// 辅助工厂
// ============================================================

function createBuilder(matchId = 'mapping-test') {
  const builder = createGameEventBuilder(matchId);
  builder.setPhase('night').setDay(1).setStep('test_step');
  return builder;
}

// ============================================================
// 测试：频道路由映射
// ============================================================

test('频道映射 - 行动类型 → 频道/scopeKey', () => {
  // 狼人行动 → scope:wolves
  assert.deepEqual(resolveActionChannel('wolf_kill'), { channel: 'scope', scopeKey: 'wolves' });
  assert.deepEqual(resolveActionChannel('wolf_speech'), { channel: 'scope', scopeKey: 'wolves' });
  assert.deepEqual(resolveActionChannel('wolf_vote'), { channel: 'scope', scopeKey: 'wolves' });

  // 神职行动 → 各自 scope
  assert.deepEqual(resolveActionChannel('seer_check'), { channel: 'scope', scopeKey: 'seer' });
  assert.deepEqual(resolveActionChannel('guard_protect'), { channel: 'scope', scopeKey: 'guard' });
  assert.deepEqual(resolveActionChannel('witch_save'), { channel: 'scope', scopeKey: 'witch' });
  assert.deepEqual(resolveActionChannel('witch_poison'), { channel: 'scope', scopeKey: 'witch' });

  // 公共行动 → public
  assert.deepEqual(resolveActionChannel('day_speech'), { channel: 'public' });
  assert.deepEqual(resolveActionChannel('day_vote'), { channel: 'public' });
  assert.deepEqual(resolveActionChannel('sheriff_vote'), { channel: 'public' });
  assert.deepEqual(resolveActionChannel('unknown_action'), { channel: 'public' });
});

test('频道映射 - 角色 → 频道/scopeKey', () => {
  assert.deepEqual(getChannelForRole('werewolf'), { channel: 'scope', scopeKey: 'wolves' });
  assert.deepEqual(getChannelForRole('white_wolf_king'), { channel: 'scope', scopeKey: 'wolves' });
  assert.deepEqual(getChannelForRole('seer'), { channel: 'scope', scopeKey: 'seer' });
  assert.deepEqual(getChannelForRole('guard'), { channel: 'scope', scopeKey: 'guard' });
  assert.deepEqual(getChannelForRole('witch'), { channel: 'scope', scopeKey: 'witch' });

  // 无特殊频道 → public
  assert.deepEqual(getChannelForRole('villager'), { channel: 'public' });
  assert.deepEqual(getChannelForRole('hunter'), { channel: 'public' });
  assert.deepEqual(getChannelForRole('idiot'), { channel: 'public' });
});

// ============================================================
// 测试：GameEventBuilder 事件 ↔ 传统 workflow event 映射
// ============================================================

test('事件映射 - action_requested → legacy', () => {
  const builder = createBuilder();
  const event = builder.buildActionRequested('wolf_kill', [1, 2, 3], {
    optional: false,
    ordered: true,
    actionWindow: { id: 'window-1', day: 1 },
  });

  // 验证 GameEvent 结构
  assert.equal(event.type, 'action-requested');
  assert.equal(event.channel, 'scope');
  assert.equal(event.scopeKey, 'wolves');
  assert.ok(event.id);
  assert.ok(event.metadata.sequence > 0);

  // 验证负载完整
  assert.equal(event.payload.actionType, 'wolf_kill');
  assert.deepEqual(event.payload.actorIds, [1, 2, 3]);
  assert.equal(event.payload.optional, false);
  assert.equal(event.payload.ordered, true);
  assert.ok(event.payload.actionWindow);

  // 验证 presentation 包含必要字段
  assert.ok(typeof event.presentation.speakableText === 'string');
  assert.ok(typeof event.presentation.displayText === 'string');
  assert.ok(event.presentation.displayMode);
});

test('事件映射 - speech → legacy', () => {
  const builder = createBuilder();
  builder.setPhase('day').setDay(2);

  const event = builder.buildSpeech({
    playerId: 3,
    text: '我投票放逐 4 号',
    thinking: '4 号发言漏洞多',
  });

  assert.equal(event.type, 'speech');
  assert.equal(event.channel, 'public');
  assert.equal(event.payload.playerId, 3);
  assert.equal(event.payload.text, '我投票放逐 4 号');
  assert.equal(event.payload.thinking, '4 号发言漏洞多');
});

test('事件映射 - wolf_speech → legacy', () => {
  const builder = createBuilder();
  const event = builder.buildWolfSpeech({
    playerId: 1,
    text: '今晚刀 5 号',
    isLeader: true,
    sharedSpeeches: [{ playerId: 2, text: '同意' }],
  });

  assert.equal(event.type, 'wolf-speech');
  assert.equal(event.channel, 'scope');
  assert.equal(event.scopeKey, 'wolves');
  assert.equal(event.payload.isLeader, true);
});

test('事件映射 - self_destruct → legacy', () => {
  const builder = createBuilder();
  builder.setPhase('day').setDay(1);

  const event = builder.buildSelfDestruct({
    playerId: 2,
    text: '2 号狼人自爆。',
  });

  assert.equal(event.type, 'self-destruct');
  assert.equal(event.channel, 'public');
  assert.equal(event.payload.playerId, 2);
});

test('事件映射 - skill_requested / skill_thinking / skill_completed', () => {
  const builder = createBuilder();

  const requested = builder.buildSkillRequested('kill', 1, { target: 4 });
  assert.equal(requested.type, 'skill-requested');
  assert.equal(requested.channel, 'system');
  assert.equal(requested.payload.skillId, 'kill');
  assert.equal(requested.payload.actorId, 1);
  assert.ok(requested.payload.context);

  const thinking = builder.buildSkillThinking('kill', 1, '选 4 号，因为他可能是预言家');
  assert.equal(thinking.type, 'skill-thinking');
  assert.equal(thinking.channel, 'system');
  assert.equal(thinking.payload.thinking, '选 4 号，因为他可能是预言家');

  const completed = builder.buildSkillCompleted('kill', 1, { target: 4 }, 320);
  assert.equal(completed.type, 'skill-completed');
  assert.equal(completed.channel, 'system');
  assert.equal(completed.payload.duration, 320);
});

test('事件映射 - night_result → legacy', () => {
  const builder = createBuilder();
  const event = builder.buildNightResult(
    [{ id: 4, reason: '狼人袭击' }, { id: 6, reason: '毒杀' }],
    '昨晚 4 号和 6 号死亡',
  );

  assert.equal(event.type, 'night-result');
  assert.equal(event.channel, 'public');
  assert.equal(event.payload.deaths.length, 2);
  assert.equal(event.payload.message, '昨晚 4 号和 6 号死亡');
});

test('事件映射 - vote_result → legacy', () => {
  const builder = createBuilder();
  builder.setPhase('day').setDay(2);

  const event = builder.buildVoteResult(
    { 1: 3, 2: 3, 3: 4 },
    { 3: 2, 4: 1 },
    { id: 3, reason: '放逐' },
    '3 号被放逐',
  );

  assert.equal(event.type, 'vote-result');
  assert.equal(event.channel, 'public');
  assert.equal(event.payload.exile?.id, 3);
  assert.deepEqual(event.payload.votes, { 1: 3, 2: 3, 3: 4 });
});

test('事件映射 - sheriff_events', () => {
  const builder = createBuilder();
  builder.setPhase('day').setDay(1);

  // 警长开始
  const start = builder.buildSheriffEvent('sheriff-start', {
    election: { candidates: [1, 3, 5] },
    message: '警长竞选开始',
  });
  assert.equal(start.type, 'sheriff-start');

  // 警长结果
  const result = builder.buildSheriffEvent('sheriff-result', {
    election: { winner: 3 },
    message: '3 号当选警长',
  });
  assert.equal(result.type, 'sheriff-result');

  // 警徽转移
  const transfer = builder.buildSheriffBadgeTransfer({
    from: 3,
    to: 1,
    reason: '死亡转移',
  }, '警长把警徽移交给1号玩家。', 1, { status: 'held' });
  assert.equal(transfer.type, 'sheriff-badge-transfer');
});

test('事件映射 - role_wake_events', () => {
  const builder = createBuilder();

  const wolf = builder.buildWolfWake('狼人请睁眼');
  assert.equal(wolf.type, 'wolf-wake');
  assert.equal(wolf.scopeKey, 'wolves');

  const seer = builder.buildSeerWake('预言家请睁眼');
  assert.equal(seer.type, 'seer-wake');
  assert.equal(seer.scopeKey, 'seer');

  const guard = builder.buildGuardWake('守卫请睁眼');
  assert.equal(guard.type, 'guard-wake');
  assert.equal(guard.scopeKey, 'guard');

  const antidote = builder.buildWitchAntidote('今晚有人死亡，要使用解药吗？');
  assert.equal(antidote.type, 'witch-antidote');
  assert.equal(antidote.scopeKey, 'witch');

  const poison = builder.buildWitchPoison('要使用毒药吗？');
  assert.equal(poison.type, 'witch-poison');
  assert.equal(poison.scopeKey, 'witch');
});

test('事件映射 - game_end / workflow_completed', () => {
  const builder = createBuilder();

  const end = builder.buildGameEnd('good', '狼人全部出局');
  assert.equal(end.type, 'game-end');
  assert.equal(end.channel, 'public');
  assert.equal(end.payload.winner, 'good');

  const completed = builder.buildWorkflowCompleted('游戏正常结束');
  assert.equal(completed.type, 'workflow-completed');
});

test('事件映射 - last_words / exile_words', () => {
  const builder = createBuilder();

  const last = builder.buildLastWords({ playerId: 4, text: '我是平民，狼人刀错了' });
  assert.equal(last.type, 'last-words');
  assert.equal(last.channel, 'public');

  const exile = builder.buildExileWords({ playerId: 3, text: '我真的是守卫' });
  assert.equal(exile.type, 'exile-words');
  assert.equal(exile.channel, 'public');
});

test('事件映射 - phase_start / phase_end', () => {
  const builder = createBuilder();
  builder.setPhase('night').setDay(1);

  const start = builder.buildPhaseStart('night', '天黑请闭眼');
  assert.equal(start.type, 'phase-start');
  assert.equal(start.payload.phase, 'night');
  assert.equal(start.channel, 'public');

  const endEvent = builder.build('phase-end', { phase: 'night', message: '天亮了' }, 'public');
  assert.equal(endEvent.type, 'phase-end');
});

test('事件映射 - 错误事件', () => {
  const builder = createBuilder();

  const error = builder.buildError('TIMEOUT', 'AI 响应超时', { timeoutMs: 30000 });
  assert.equal(error.type, 'error');
  assert.equal(error.channel, 'system');
  assert.equal(error.payload.code, 'TIMEOUT');
  assert.equal(error.payload.message, 'AI 响应超时');
});

// ============================================================
// 测试：往返转换 (GameEvent → flat → 验证关键字段)
// ============================================================

test('往返映射 - GameEvent 核心字段不丢失', () => {
  const builder = createBuilder();
  builder.setPhase('night').setDay(1).setStep('wolf_kill_1');

  const event = builder.buildActionRequested('wolf_kill', [1, 2, 3], {
    optional: false,
    ordered: true,
  });

  // 模拟传统投影：提取关键字段
  const flatEvent = eventToFlat(event);

  // 验证传统消费者需要的所有字段
  assert.equal(flatEvent.type, 'workflow-event');
  assert.equal(flatEvent.matchId, 'mapping-test');
  assert.equal(flatEvent.workflowEvent, 'action-requested');
  assert.equal(flatEvent.actionType, 'wolf_kill');
  assert.equal(flatEvent.channel, 'scope');
  assert.equal(flatEvent.scopeKey, 'wolves');
  assert.ok(flatEvent.presentation);
  assert.ok(typeof flatEvent.presentation.speakableText === 'string');
  assert.ok(flatEvent.metadata);
  assert.equal(flatEvent.metadata.day, 1);
  assert.equal(flatEvent.metadata.phase, 'night');
});

test('往返映射 - speech 事件字段不丢失', () => {
  const builder = createBuilder();
  builder.setPhase('day').setDay(2);

  const event = builder.buildSpeech({
    playerId: 3,
    text: '我同意放逐 5 号',
    thinking: '5 号很可疑',
    fullText: '经过分析，我同意放逐 5 号，因为他的发言有很多漏洞',
  });

  const flatEvent = eventToFlat(event);
  assert.equal(flatEvent.workflowEvent, 'speech');
  assert.equal(flatEvent.message, '我同意放逐 5 号');
  assert.equal(flatEvent.speech.playerId, 3);
  assert.equal(flatEvent.speech.text, '我同意放逐 5 号');
  assert.equal(flatEvent.speech.thinking, '5 号很可疑');
});

// ============================================================
// 测试：viewPolicy 频道路由正确
// ============================================================

test('ViewPolicy - scope 事件不可被错误角色访问', () => {
  // 模拟信息层的访问控制场景
  const wolfEvent = { channel: 'scope', scopeKey: 'wolves' };
  const seerEvent = { channel: 'scope', scopeKey: 'seer' };
  const publicEvent = { channel: 'public' };

  // 狼人查看者
  assert.equal(canAccessSimulate(wolfEvent, { faction: 'wolves' }), true);
  assert.equal(canAccessSimulate(seerEvent, { faction: 'wolves' }), false);
  assert.equal(canAccessSimulate(publicEvent, { faction: 'wolves' }), true);

  // 预言家查看者
  assert.equal(canAccessSimulate(wolfEvent, { roles: ['seer'] }), false);
  assert.equal(canAccessSimulate(seerEvent, { roles: ['seer'] }), true);
  assert.equal(canAccessSimulate(publicEvent, { roles: ['seer'] }), true);

  // 平民查看者
  assert.equal(canAccessSimulate(wolfEvent, { faction: 'good' }), false);
  assert.equal(canAccessSimulate(seerEvent, { faction: 'good' }), false);
  assert.equal(canAccessSimulate(publicEvent, { faction: 'good' }), true);
});

// ============================================================
// 辅助函数
// ============================================================

function eventToFlat(event: { type: string; channel: string; scopeKey?: string; payload: unknown; metadata: Record<string, unknown>; presentation: Record<string, unknown>; game?: unknown }): Record<string, unknown> {
  const payload = event.payload as Record<string, unknown>;
  const isSpeech = event.type === 'speech' || event.type === 'wolf-speech';
  return {
    type: 'workflow-event',
    matchId: event.metadata.matchId,
    workflowEvent: event.type,
    actionType: payload.actionType || '',
    message: event.presentation.speakableText || (isSpeech ? (payload as any).text : '') || '',
    channel: event.channel,
    scopeKey: event.scopeKey,
    presentation: event.presentation,
    metadata: event.metadata,
    speech: isSpeech ? { playerId: (payload as any).playerId, text: (payload as any).text, thinking: (payload as any).thinking } : undefined,
    actionWindow: (payload as any).actionWindow || undefined,
    game: event.game || undefined,
  };
}

interface SimulatedViewer {
  faction?: string;
  roles?: string[];
}

function canAccessSimulate(
  event: { channel: string; scopeKey?: string },
  viewer: SimulatedViewer,
): boolean {
  if (event.channel === 'public') return true;
  if (event.channel === 'system') return false; // 只有系统查看者
  if (event.channel === 'scope') {
    const key = event.scopeKey || '';
    if (key === 'wolves') return viewer.faction === 'wolves';
    if (['seer', 'guard', 'witch'].includes(key)) return (viewer.roles || []).includes(key);
    return false;
  }
  return false;
}
