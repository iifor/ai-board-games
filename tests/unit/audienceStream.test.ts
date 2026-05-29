import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudienceStream } from '../../packages/server/modules/werewolf/audienceStream';
import { WerewolfEventBus } from '../../packages/server/modules/werewolf/eventBus';
import { createGameEventBuilder } from '../../packages/server/modules/werewolf/gameEventBuilder';
import type { GameEvent } from '../../packages/shared/types/gameEvent';

function createTestEvent(overrides: Partial<GameEvent> = {}): GameEvent {
  return {
    id: 'test-event-1',
    type: 'phase-start',
    channel: 'public',
    payload: { phase: 'night', message: '天黑请闭眼' },
    metadata: {
      matchId: 'match-001',
      stepId: 'night_start_1',
      phase: 'night',
      day: 1,
      timestamp: new Date().toISOString(),
      sequence: 1
    },
    presentation: {
      speakableText: '天黑请闭眼',
      displayText: '天黑请闭眼',
      displayMode: 'status',
      uiHint: 'night-start',
      suppressSpeech: false
    },
    ...overrides
  };
}

test('AudienceStream - 创建会话', () => {
  const eventBus = new WerewolfEventBus();
  const stream = createAudienceStream(eventBus);

  const session = stream.createSession('match-001', {
    viewMode: 'god'
  });

  assert.ok(session.id, '会话应有 id');
  assert.equal(session.matchId, 'match-001');
  assert.equal(session.status, 'active');
  assert.equal(session.options.viewMode, 'god');
  assert.ok(session.viewer, '会话应有 viewer');

  // 清理
  stream.destroy();
});

test('AudienceStream - 多会话管理', () => {
  const eventBus = new WerewolfEventBus();
  const stream = createAudienceStream(eventBus);

  const session1 = stream.createSession('match-001', { viewMode: 'god' });
  const session2 = stream.createSession('match-001', { viewMode: 'player', viewerPlayerId: 1 });
  const session3 = stream.createSession('match-002', { viewMode: 'god' });

  assert.equal(stream.getSessionCount(), 3);
  assert.equal(stream.getActiveSessionCount(), 3);

  // 暂停一个会话
  stream.pause(session2.id);
  assert.equal(stream.getActiveSessionCount(), 2);
  assert.equal(stream.getPausedSessionCount(), 1);

  // 移除一个会话
  stream.removeSession(session3.id);
  assert.equal(stream.getSessionCount(), 2);

  // 清理
  stream.destroy();
});

test('AudienceStream - 事件分发', async () => {
  const eventBus = new WerewolfEventBus();
  const stream = createAudienceStream(eventBus);

  const session = stream.createSession('match-001', { viewMode: 'god' });

  // 发布事件
  const event = createTestEvent();
  await eventBus.publish(event);

  // 等待事件分发
  await new Promise(resolve => setTimeout(resolve, 50));

  // 验证事件已入队
  const queuedEvents = stream.getQueuedEvents(session.id);
  assert.equal(queuedEvents.length, 1);
  assert.equal(queuedEvents[0].id, 'test-event-1');

  // 清理
  stream.destroy();
});

test('AudienceStream - 视角过滤', async () => {
  const eventBus = new WerewolfEventBus();
  const stream = createAudienceStream(eventBus);

  // 创建狼人视角会话
  const wolfSession = stream.createSession('match-001', {
    viewMode: 'player',
    viewerPlayerId: 1,
    viewerFaction: 'wolves'
  });

  // 创建普通村民视角会话（看不到狼人专属信息）
  const villagerSession = stream.createSession('match-001', {
    viewMode: 'player',
    viewerPlayerId: 4,
    viewerFaction: 'good'
  });

  // 创建上帝视角会话（可以看到所有信息）
  const godSession = stream.createSession('match-001', {
    viewMode: 'god'
  });

  // 发布狼人专属事件
  const wolfEvent = createTestEvent({
    channel: 'scope',
    scopeKey: 'wolves'
  });
  await eventBus.publish(wolfEvent);

  // 发布公开事件
  const publicEvent = createTestEvent({
    id: 'public-event',
    channel: 'public'
  });
  await eventBus.publish(publicEvent);

  // 等待事件分发
  await new Promise(resolve => setTimeout(resolve, 50));

  // 狼人会话应该收到两个事件（狼人专属 + 公开）
  const wolfEvents = stream.getQueuedEvents(wolfSession.id);
  assert.equal(wolfEvents.length, 2);

  // 村民会话应该只收到公开事件（看不到狼人专属）
  const villagerEvents = stream.getQueuedEvents(villagerSession.id);
  assert.equal(villagerEvents.length, 1);
  assert.equal(villagerEvents[0].id, 'public-event');

  // 上帝视角会话应该收到所有事件
  const godEvents = stream.getQueuedEvents(godSession.id);
  assert.equal(godEvents.length, 2);

  // 清理
  stream.destroy();
});

test('AudienceStream - 会话控制', async () => {
  const eventBus = new WerewolfEventBus();
  const stream = createAudienceStream(eventBus);

  const session = stream.createSession('match-001', { viewMode: 'god' });

  // 暂停会话
  stream.pause(session.id);

  // 发布事件
  await eventBus.publish(createTestEvent());

  // 等待事件分发
  await new Promise(resolve => setTimeout(resolve, 50));

  // 暂停的会话不应该收到事件
  const events = stream.getQueuedEvents(session.id);
  assert.equal(events.length, 0);

  // 恢复会话
  stream.resume(session.id);

  // 再次发布事件
  await eventBus.publish(createTestEvent({ id: 'event-2' }));

  // 等待事件分发
  await new Promise(resolve => setTimeout(resolve, 50));

  // 恢复后应该收到新事件
  const newEvents = stream.getQueuedEvents(session.id);
  assert.equal(newEvents.length, 1);

  // 清理
  stream.destroy();
});

test('AudienceStream - 速度控制', () => {
  const eventBus = new WerewolfEventBus();
  const stream = createAudienceStream(eventBus);

  const session = stream.createSession('match-001', { viewMode: 'god' });

  // 设置速度
  stream.setSpeed(session.id, 2);
  const updatedSession = stream.getSession(session.id);
  assert.equal(updatedSession?.options.speed, 2);

  // 速度边界测试
  stream.setSpeed(session.id, 0.1); // 低于最小值
  assert.equal(updatedSession?.options.speed, 0.25);

  stream.setSpeed(session.id, 10); // 高于最大值
  assert.equal(updatedSession?.options.speed, 4);

  // 清理
  stream.destroy();
});

test('AudienceStream - 自定义过滤器', async () => {
  const eventBus = new WerewolfEventBus();
  const stream = createAudienceStream(eventBus);

  // 创建带过滤器的会话
  const session = stream.createSession('match-001', {
    viewMode: 'god',
    filter: (event) => event.type === 'speech'
  });

  // 发布不同类型的事件
  await eventBus.publish(createTestEvent({ type: 'phase-start' }));
  await eventBus.publish(createTestEvent({ type: 'speech' }));
  await eventBus.publish(createTestEvent({ type: 'phase-end' }));

  // 等待事件分发
  await new Promise(resolve => setTimeout(resolve, 50));

  // 只有 speech 事件应该被接收
  const events = stream.getQueuedEvents(session.id);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'speech');

  // 清理
  stream.destroy();
});

test('AudienceStream - 延迟播报', async () => {
  const eventBus = new WerewolfEventBus();
  const stream = createAudienceStream(eventBus);

  // 创建延迟会话
  const session = stream.createSession('match-001', {
    viewMode: 'god',
    delayMs: 100
  });

  // 发布事件
  await eventBus.publish(createTestEvent());

  // 立即检查 - 应该没有事件
  const immediateEvents = stream.getQueuedEvents(session.id);
  assert.equal(immediateEvents.length, 0);

  // 等待延迟
  await new Promise(resolve => setTimeout(resolve, 150));

  // 延迟后应该有事件
  const delayedEvents = stream.getQueuedEvents(session.id);
  assert.equal(delayedEvents.length, 1);

  // 清理
  stream.destroy();
});

test('AudienceStream - 会话完成', () => {
  const eventBus = new WerewolfEventBus();
  const stream = createAudienceStream(eventBus);

  const session = stream.createSession('match-001', { viewMode: 'god' });

  // 完成会话
  stream.complete(session.id);

  const completedSession = stream.getSession(session.id);
  assert.equal(completedSession?.status, 'completed');

  // 清理
  stream.destroy();
});

test('AudienceStream - 查询方法', () => {
  const eventBus = new WerewolfEventBus();
  const stream = createAudienceStream(eventBus);

  // 初始状态
  assert.equal(stream.getSessionCount(), 0);
  assert.equal(stream.getActiveSessionCount(), 0);
  assert.equal(stream.getTotalEventsDistributed(), 0);

  // 创建会话
  stream.createSession('match-001', { viewMode: 'god' });
  stream.createSession('match-001', { viewMode: 'god' });

  assert.equal(stream.getSessionCount(), 2);
  assert.equal(stream.getActiveSessionCount(), 2);

  // 清理
  stream.destroy();
});
