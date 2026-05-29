/**
 * Skill 事件发射器
 * 标准化 Skill 生命周期事件
 */

import type {
  GameEvent,
  SkillRequestedPayload,
  SkillThinkingPayload,
  SkillCompletedPayload
} from '@ai-presenter/shared/types/gameEvent';
import type { WerewolfEventBus } from '../werewolf/eventBus';
import type { GameEventBuilder } from '../werewolf/gameEventBuilder';

// ============================================================
// 类型定义
// ============================================================

export interface SkillEventContext {
  skillId: string;
  actorId: number;
  phase: string;
  matchId: string;
  stepId?: string;
  day?: number;
}

export interface SkillExecutionResult {
  success: boolean;
  result?: unknown;
  error?: Error;
  duration?: number;
  thinking?: string;
}

// ============================================================
// SkillEventEmitter 实现
// ============================================================

export class SkillEventEmitter {
  private eventBus: WerewolfEventBus;
  private eventBuilder: GameEventBuilder;
  private executionTimers: Map<string, number> = new Map();

  constructor(eventBus: WerewolfEventBus, eventBuilder: GameEventBuilder) {
    this.eventBus = eventBus;
    this.eventBuilder = eventBuilder;
  }

  // ----------------------------------------------------------
  // 生命周期事件发射
  // ----------------------------------------------------------

  /**
   * 发射 Skill 请求事件
   */
  async emitRequested(context: SkillEventContext, skillContext: Record<string, unknown>): Promise<void> {
    const event = this.eventBuilder.buildSkillRequested(
      context.skillId,
      context.actorId,
      skillContext
    );

    // 记录开始时间
    const timerKey = this.getTimerKey(context);
    this.executionTimers.set(timerKey, Date.now());

    await this.eventBus.publish(event);
  }

  /**
   * 发射 Skill 思考事件
   */
  async emitThinking(context: SkillEventContext, thinking: string): Promise<void> {
    const event = this.eventBuilder.buildSkillThinking(
      context.skillId,
      context.actorId,
      thinking
    );

    await this.eventBus.publish(event);
  }

  /**
   * 发射 Skill 执行中事件
   */
  async emitExecuting(context: SkillEventContext): Promise<void> {
    const event = this.eventBuilder.build(
      'skill-executing',
      {
        skillId: context.skillId,
        actorId: context.actorId
      },
      'system'
    );

    await this.eventBus.publish(event);
  }

  /**
   * 发射 Skill 完成事件
   */
  async emitCompleted(context: SkillEventContext, result: SkillExecutionResult): Promise<void> {
    const timerKey = this.getTimerKey(context);
    const startTime = this.executionTimers.get(timerKey);
    const duration = startTime ? Date.now() - startTime : undefined;

    const event = this.eventBuilder.buildSkillCompleted(
      context.skillId,
      context.actorId,
      result.result,
      duration
    );

    // 清理计时器
    this.executionTimers.delete(timerKey);

    await this.eventBus.publish(event);
  }

  /**
   * 发射 Skill 失败事件
   */
  async emitFailed(context: SkillEventContext, error: Error): Promise<void> {
    const timerKey = this.getTimerKey(context);
    const startTime = this.executionTimers.get(timerKey);
    const duration = startTime ? Date.now() - startTime : undefined;

    const event = this.eventBuilder.build(
      'skill-failed',
      {
        skillId: context.skillId,
        actorId: context.actorId,
        error: {
          message: error.message,
          code: (error as any).code || 'UNKNOWN_ERROR'
        },
        duration
      },
      'system'
    );

    // 清理计时器
    this.executionTimers.delete(timerKey);

    await this.eventBus.publish(event);
  }

  /**
   * 发射 Skill 应用事件（结果已应用到游戏状态）
   */
  async emitApplied(context: SkillEventContext, result: unknown): Promise<void> {
    const event = this.eventBuilder.build(
      'skill-applied',
      {
        skillId: context.skillId,
        actorId: context.actorId,
        result
      },
      'system'
    );

    await this.eventBus.publish(event);
  }

  // ----------------------------------------------------------
  // 便捷方法
  // ----------------------------------------------------------

  /**
   * 包装 Skill 执行，自动发射生命周期事件
   */
  async executeWithEvents<T>(
    context: SkillEventContext,
    skillContext: Record<string, unknown>,
    executor: () => Promise<T>
  ): Promise<T> {
    // 发射请求事件
    await this.emitRequested(context, skillContext);

    try {
      // 发射执行中事件
      await this.emitExecuting(context);

      // 执行 Skill
      const result = await executor();

      // 发射完成事件
      await this.emitCompleted(context, {
        success: true,
        result
      });

      return result;
    } catch (error) {
      // 发射失败事件
      await this.emitFailed(context, error as Error);
      throw error;
    }
  }

  /**
   * 包装 Skill 执行，支持思考过程展示
   */
  async executeWithThinking<T>(
    context: SkillEventContext,
    skillContext: Record<string, unknown>,
    executor: (onThinking: (thinking: string) => void) => Promise<T>
  ): Promise<T> {
    // 发射请求事件
    await this.emitRequested(context, skillContext);

    try {
      // 发射执行中事件
      await this.emitExecuting(context);

      // 创建思考回调
      const onThinking = async (thinking: string) => {
        await this.emitThinking(context, thinking);
      };

      // 执行 Skill
      const result = await executor(onThinking);

      // 发射完成事件
      await this.emitCompleted(context, {
        success: true,
        result
      });

      return result;
    } catch (error) {
      // 发射失败事件
      await this.emitFailed(context, error as Error);
      throw error;
    }
  }

  // ----------------------------------------------------------
  // 内部方法
  // ----------------------------------------------------------

  private getTimerKey(context: SkillEventContext): string {
    return `${context.matchId}:${context.skillId}:${context.actorId}`;
  }

  // ----------------------------------------------------------
  // 查询方法
  // ----------------------------------------------------------

  getActiveExecutions(): number {
    return this.executionTimers.size;
  }

  getExecutionTime(context: SkillEventContext): number | undefined {
    const timerKey = this.getTimerKey(context);
    const startTime = this.executionTimers.get(timerKey);
    if (startTime) {
      return Date.now() - startTime;
    }
    return undefined;
  }
}

// ============================================================
// 工厂函数
// ============================================================

export function createSkillEventEmitter(
  eventBus: WerewolfEventBus,
  eventBuilder: GameEventBuilder
): SkillEventEmitter {
  return new SkillEventEmitter(eventBus, eventBuilder);
}
