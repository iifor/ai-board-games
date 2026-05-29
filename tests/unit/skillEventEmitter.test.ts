import test from 'node:test';
import assert from 'node:assert/strict';
import { createSkillEventEmitter } from '../../packages/server/modules/agent-core/skillEventEmitter';
import { WerewolfEventBus } from '../../packages/server/modules/werewolf/eventBus';
import { createGameEventBuilder } from '../../packages/server/modules/werewolf/gameEventBuilder';
import type { GameEvent } from '../../packages/shared/types/gameEvent';

test('SkillEventEmitter - 发射请求事件', async () => {
  const eventBus = new WerewolfEventBus();
  const eventBuilder = createGameEventBuilder('match-001');
  const emitter = createSkillEventEmitter(eventBus, eventBuilder);

  const receivedEvents: GameEvent[] = [];
  eventBus.subscribeSystem((event) => {
    receivedEvents.push(event);
  });

  const context = {
    skillId: 'kill',
    actorId: 1,
    phase: 'night',
    matchId: 'match-001',
    stepId: 'wolf_kill_1',
    day: 1
  };

  await emitter.emitRequested(context, { target: 4 });

  assert.equal(receivedEvents.length, 1);
  assert.equal(receivedEvents[0].type, 'skill-requested');
  assert.equal(receivedEvents[0].payload.skillId, 'kill');
  assert.equal(receivedEvents[0].payload.actorId, 1);
});

test('SkillEventEmitter - 发射思考事件', async () => {
  const eventBus = new WerewolfEventBus();
  const eventBuilder = createGameEventBuilder('match-001');
  const emitter = createSkillEventEmitter(eventBus, eventBuilder);

  const receivedEvents: GameEvent[] = [];
  eventBus.subscribeSystem((event) => {
    receivedEvents.push(event);
  });

  const context = {
    skillId: 'kill',
    actorId: 1,
    phase: 'night',
    matchId: 'match-001'
  };

  await emitter.emitThinking(context, '分析局势中...');

  assert.equal(receivedEvents.length, 1);
  assert.equal(receivedEvents[0].type, 'skill-thinking');
  assert.equal(receivedEvents[0].payload.thinking, '分析局势中...');
});

test('SkillEventEmitter - 发射完成事件', async () => {
  const eventBus = new WerewolfEventBus();
  const eventBuilder = createGameEventBuilder('match-001');
  const emitter = createSkillEventEmitter(eventBus, eventBuilder);

  const receivedEvents: GameEvent[] = [];
  eventBus.subscribeSystem((event) => {
    receivedEvents.push(event);
  });

  const context = {
    skillId: 'kill',
    actorId: 1,
    phase: 'night',
    matchId: 'match-001'
  };

  // 先发射请求事件（开始计时）
  await emitter.emitRequested(context, {});

  // 模拟一些延迟
  await new Promise(resolve => setTimeout(resolve, 50));

  // 发射完成事件
  await emitter.emitCompleted(context, {
    success: true,
    result: { target: 4 },
    duration: 50
  });

  assert.equal(receivedEvents.length, 2);
  assert.equal(receivedEvents[1].type, 'skill-completed');
  assert.ok(receivedEvents[1].payload.duration >= 50);
});

test('SkillEventEmitter - 发射失败事件', async () => {
  const eventBus = new WerewolfEventBus();
  const eventBuilder = createGameEventBuilder('match-001');
  const emitter = createSkillEventEmitter(eventBus, eventBuilder);

  const receivedEvents: GameEvent[] = [];
  eventBus.subscribeSystem((event) => {
    receivedEvents.push(event);
  });

  const context = {
    skillId: 'kill',
    actorId: 1,
    phase: 'night',
    matchId: 'match-001'
  };

  await emitter.emitFailed(context, new Error('执行失败'));

  assert.equal(receivedEvents.length, 1);
  assert.equal(receivedEvents[0].type, 'skill-failed');
  assert.equal(receivedEvents[0].payload.error.message, '执行失败');
});

test('SkillEventEmitter - 包装执行', async () => {
  const eventBus = new WerewolfEventBus();
  const eventBuilder = createGameEventBuilder('match-001');
  const emitter = createSkillEventEmitter(eventBus, eventBuilder);

  const receivedEvents: GameEvent[] = [];
  eventBus.subscribeSystem((event) => {
    receivedEvents.push(event);
  });

  const context = {
    skillId: 'kill',
    actorId: 1,
    phase: 'night',
    matchId: 'match-001'
  };

  // 使用 executeWithEvents 包装执行
  const result = await emitter.executeWithEvents(
    context,
    { target: 4 },
    async () => {
      // 模拟执行
      return { target: 4 };
    }
  );

  // 验证结果
  assert.deepEqual(result, { target: 4 });

  // 验证事件（requested + executing + completed）
  assert.equal(receivedEvents.length, 3);
  assert.equal(receivedEvents[0].type, 'skill-requested');
  assert.equal(receivedEvents[1].type, 'skill-executing');
  assert.equal(receivedEvents[2].type, 'skill-completed');
});

test('SkillEventEmitter - 包装执行失败', async () => {
  const eventBus = new WerewolfEventBus();
  const eventBuilder = createGameEventBuilder('match-001');
  const emitter = createSkillEventEmitter(eventBus, eventBuilder);

  const receivedEvents: GameEvent[] = [];
  eventBus.subscribeSystem((event) => {
    receivedEvents.push(event);
  });

  const context = {
    skillId: 'kill',
    actorId: 1,
    phase: 'night',
    matchId: 'match-001'
  };

  // 使用 executeWithEvents 包装执行（会失败）
  try {
    await emitter.executeWithEvents(
      context,
      { target: 4 },
      async () => {
        throw new Error('执行失败');
      }
    );
    assert.fail('应该抛出错误');
  } catch (error) {
    assert.equal((error as Error).message, '执行失败');
  }

  // 验证事件（requested + executing + failed）
  assert.equal(receivedEvents.length, 3);
  assert.equal(receivedEvents[0].type, 'skill-requested');
  assert.equal(receivedEvents[1].type, 'skill-executing');
  assert.equal(receivedEvents[2].type, 'skill-failed');
});

test('SkillEventEmitter - 带思考的执行', async () => {
  const eventBus = new WerewolfEventBus();
  const eventBuilder = createGameEventBuilder('match-001');
  const emitter = createSkillEventEmitter(eventBus, eventBuilder);

  const receivedEvents: GameEvent[] = [];
  eventBus.subscribeSystem((event) => {
    receivedEvents.push(event);
  });

  const context = {
    skillId: 'kill',
    actorId: 1,
    phase: 'night',
    matchId: 'match-001'
  };

  // 使用 executeWithThinking 包装执行
  const result = await emitter.executeWithThinking(
    context,
    { target: 4 },
    async (onThinking) => {
      // 发射思考事件
      onThinking('分析局势...');
      onThinking('选择目标...');

      // 模拟执行
      return { target: 4 };
    }
  );

  // 验证结果
  assert.deepEqual(result, { target: 4 });

  // 验证事件（requested + executing + thinking + thinking + completed）
  assert.equal(receivedEvents.length, 5);
  assert.equal(receivedEvents[0].type, 'skill-requested');
  assert.equal(receivedEvents[1].type, 'skill-executing');
  assert.equal(receivedEvents[2].type, 'skill-thinking');
  assert.equal(receivedEvents[3].type, 'skill-thinking');
  assert.equal(receivedEvents[4].type, 'skill-completed');
});

test('SkillEventEmitter - 查询方法', async () => {
  const eventBus = new WerewolfEventBus();
  const eventBuilder = createGameEventBuilder('match-001');
  const emitter = createSkillEventEmitter(eventBus, eventBuilder);

  // 初始状态
  assert.equal(emitter.getActiveExecutions(), 0);

  const context = {
    skillId: 'kill',
    actorId: 1,
    phase: 'night',
    matchId: 'match-001'
  };

  // 开始执行
  await emitter.emitRequested(context, {});
  assert.equal(emitter.getActiveExecutions(), 1);

  // 获取执行时间
  const executionTime = emitter.getExecutionTime(context);
  assert.ok(executionTime !== undefined);
  assert.ok(executionTime >= 0);

  // 完成执行
  await emitter.emitCompleted(context, { success: true });
  assert.equal(emitter.getActiveExecutions(), 0);
});
