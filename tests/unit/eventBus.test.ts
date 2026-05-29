import test from 'node:test';
import assert from 'node:assert/strict';
import { WerewolfEventBus, LoggingMiddleware } from '../../packages/server/modules/werewolf/eventBus';
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

test('EventBus - 基本发布/订阅', async () => {
  const bus = new WerewolfEventBus();
  const receivedEvents: GameEvent[] = [];

  // 订阅公开频道
  bus.subscribePublic((event) => {
    receivedEvents.push(event);
  });

  // 发布事件
  const event = createTestEvent();
  await bus.publish(event);

  // 验证
  assert.equal(receivedEvents.length, 1);
  assert.equal(receivedEvents[0].id, 'test-event-1');
});

test('EventBus - 多频道订阅', async () => {
  const bus = new WerewolfEventBus();
  const publicEvents: GameEvent[] = [];
  const scopeEvents: GameEvent[] = [];

  // 订阅公开频道
  bus.subscribePublic((event) => {
    publicEvents.push(event);
  });

  // 订阅狼人频道
  bus.subscribeScope('wolves', (event) => {
    scopeEvents.push(event);
  });

  // 发布公开事件
  await bus.publish(createTestEvent({ channel: 'public' }));

  // 发布狼人事件
  await bus.publish(createTestEvent({
    channel: 'scope',
    scopeKey: 'wolves'
  }));

  // 验证
  assert.equal(publicEvents.length, 1);
  assert.equal(scopeEvents.length, 1);
});

test('EventBus - 通配符订阅', async () => {
  const bus = new WerewolfEventBus();
  const allEvents: GameEvent[] = [];

  // 订阅所有事件
  bus.subscribeAll((event) => {
    allEvents.push(event);
  });

  // 发布不同频道的事件
  await bus.publish(createTestEvent({ channel: 'public' }));
  await bus.publish(createTestEvent({ channel: 'scope', scopeKey: 'wolves' }));
  await bus.publish(createTestEvent({ channel: 'system' }));

  // 验证
  assert.equal(allEvents.length, 3);
});

test('EventBus - 取消订阅', async () => {
  const bus = new WerewolfEventBus();
  const receivedEvents: GameEvent[] = [];

  // 订阅并获取取消函数
  const unsubscribe = bus.subscribePublic((event) => {
    receivedEvents.push(event);
  });

  // 发布事件
  await bus.publish(createTestEvent());
  assert.equal(receivedEvents.length, 1);

  // 取消订阅
  unsubscribe();

  // 再次发布事件
  await bus.publish(createTestEvent());
  assert.equal(receivedEvents.length, 1); // 不应该增加
});

test('EventBus - 事件过滤', async () => {
  const bus = new WerewolfEventBus();
  const filteredEvents: GameEvent[] = [];

  // 带过滤器的订阅
  bus.subscribePublic(
    (event) => {
      filteredEvents.push(event);
    },
    {
      filter: (event) => event.type === 'phase-start'
    }
  );

  // 发布匹配的事件
  await bus.publish(createTestEvent({ type: 'phase-start' }));

  // 发布不匹配的事件
  await bus.publish(createTestEvent({ type: 'speech' }));

  // 验证
  assert.equal(filteredEvents.length, 1);
  assert.equal(filteredEvents[0].type, 'phase-start');
});

test('EventBus - 批量发布', async () => {
  const bus = new WerewolfEventBus();
  const receivedEvents: GameEvent[] = [];

  bus.subscribeAll((event) => {
    receivedEvents.push(event);
  });

  // 批量发布
  const events = [
    createTestEvent({ id: 'event-1' }),
    createTestEvent({ id: 'event-2' }),
    createTestEvent({ id: 'event-3' })
  ];

  await bus.publishBatch(events);

  // 验证
  assert.equal(receivedEvents.length, 3);
});

test('EventBus - 事件历史', async () => {
  const bus = new WerewolfEventBus();

  // 发布事件
  await bus.publish(createTestEvent({ id: 'event-1', type: 'phase-start' }));
  await bus.publish(createTestEvent({ id: 'event-2', type: 'speech' }));
  await bus.publish(createTestEvent({ id: 'event-3', type: 'phase-start' }));

  // 获取所有历史
  const allHistory = bus.getHistory();
  assert.equal(allHistory.length, 3);

  // 按类型过滤
  const phaseEvents = bus.getHistoryByType('phase-start');
  assert.equal(phaseEvents.length, 2);

  // 按频道过滤
  const publicEvents = bus.getHistoryByChannel('public');
  assert.equal(publicEvents.length, 3);

  // 清空历史
  bus.clearHistory();
  assert.equal(bus.getHistory().length, 0);
});

test('EventBus - 中间件', async () => {
  const bus = new WerewolfEventBus();
  const middlewareLog: string[] = [];

  // 添加日志中间件
  bus.use({
    name: 'test-logging',
    process: (event, next) => {
      middlewareLog.push(`before:${event.type}`);
      next();
      middlewareLog.push(`after:${event.type}`);
    }
  });

  const receivedEvents: GameEvent[] = [];
  bus.subscribeAll((event) => {
    receivedEvents.push(event);
  });

  // 发布事件
  await bus.publish(createTestEvent());

  // 验证中间件执行
  assert.equal(middlewareLog.length, 2);
  assert.equal(middlewareLog[0], 'before:phase-start');
  assert.equal(middlewareLog[1], 'after:phase-start');

  // 验证事件仍然被分发
  assert.equal(receivedEvents.length, 1);
});

test('EventBus - 查询方法', () => {
  const bus = new WerewolfEventBus();

  // 初始状态
  assert.equal(bus.getSubscriptionCount(), 0);
  assert.equal(bus.getMiddlewareCount(), 0);
  assert.equal(bus.hasSubscribers('public'), false);

  // 添加订阅
  const unsub1 = bus.subscribePublic(() => {});
  const unsub2 = bus.subscribeScope('wolves', () => {});

  assert.equal(bus.getSubscriptionCount(), 2);
  assert.equal(bus.hasSubscribers('public'), true);
  assert.equal(bus.hasSubscribers('scope:wolves'), true);

  // 添加中间件
  bus.use({ name: 'test', process: (_, next) => next() });
  assert.equal(bus.getMiddlewareCount(), 1);

  // 取消订阅
  unsub1();
  assert.equal(bus.getSubscriptionCount(), 1);
});

test('EventBus - 错误处理', async () => {
  const bus = new WerewolfEventBus();
  const errors: Error[] = [];

  // 添加一个会抛出错误的处理器
  bus.subscribePublic(() => {
    throw new Error('Test error');
  });

  // 添加一个正常的处理器
  const normalEvents: GameEvent[] = [];
  bus.subscribePublic((event) => {
    normalEvents.push(event);
  });

  // 发布事件（不应该抛出错误）
  await bus.publish(createTestEvent());

  // 正常处理器应该仍然收到事件
  assert.equal(normalEvents.length, 1);
});

test('EventBus - 优先级', async () => {
  const bus = new WerewolfEventBus();
  const executionOrder: number[] = [];

  // 添加不同优先级的处理器
  bus.subscribePublic(
    () => { executionOrder.push(1); },
    { priority: 1 }
  );

  bus.subscribePublic(
    () => { executionOrder.push(3); },
    { priority: 3 }
  );

  bus.subscribePublic(
    () => { executionOrder.push(2); },
    { priority: 2 }
  );

  // 发布事件
  await bus.publish(createTestEvent());

  // 验证执行顺序（高优先级先执行）
  assert.deepEqual(executionOrder, [3, 2, 1]);
});
