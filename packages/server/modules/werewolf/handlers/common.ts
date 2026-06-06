import { serializeWerewolfState, trackMatchEventPublish } from '../runtime';
import type { ChannelType } from '@ai-presenter/shared/types/channelTypes';
import { CHANNEL_TYPES } from '@ai-presenter/shared/types/channelTypes';
import type { GameEvent } from '@ai-presenter/shared/types/gameEvent';
import type { WerewolfEventBus } from '../eventBus';
import type { GameEventBuilder } from '../gameEventBuilder';
import { guardWerewolfWorkflowEventChannel } from './channelGuard';

interface WerewolfEvent {
  type: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  channel?: ChannelType;
  scopeKey?: string;
}

interface StepState {
  completedSteps?: Record<string, boolean>;
  [key: string]: unknown;
}

function createWerewolfEvent(
  match: { id: string },
  step: { id: string },
  state: Record<string, unknown>,
  workflowEvent: string,
  message: string,
  extra: Record<string, unknown> = {},
  options: { channel?: ChannelType; scopeKey?: string; idempotencyKey?: string } = {}
): WerewolfEvent {
  const basePayload = {
    stepId: step.id,
    workflowEvent,
    message,
    game: serializeWerewolfState(match, state),
    ...extra
  };
  const guarded = guardWerewolfWorkflowEventChannel({
    workflowEvent,
    payload: basePayload,
    channel: options.channel || CHANNEL_TYPES.PUBLIC,
    scopeKey: options.scopeKey,
  });
  return {
    type: workflowEvent,
    payload: {
      ...basePayload,
      channel: guarded.channel,
      scopeKey: guarded.scopeKey,
      channelInvariantIssues: guarded.invariantIssues,
    },
    idempotencyKey: options.idempotencyKey || `${match.id}:${step.id}:${workflowEvent}`,
    channel: guarded.channel,
    scopeKey: guarded.scopeKey
  };
}

// ============================================================
// Phase 4: EventBus 双写助手
// ============================================================

/**
 * 通过 EventBus 发布 GameEvent（双写路径，不影响传统事件流）
 * 如果 eventBus/gameEventBuilder 不可用则静默跳过
 * @param gameSnapshot 可选：序列化后的游戏状态快照，会注入到事件的 game 字段
 */
function publishGameEvent(
  eventBus: WerewolfEventBus | undefined,
  gameEventBuilder: GameEventBuilder | undefined,
  builderFn: (builder: GameEventBuilder) => unknown,
  gameSnapshot?: Record<string, unknown>,
): void {
  if (!eventBus || !gameEventBuilder) return;
  try {
    if (gameSnapshot) {
      gameEventBuilder.setGame(gameSnapshot as unknown as Parameters<GameEventBuilder['setGame']>[0]);
    }
    const event = builderFn(gameEventBuilder);
    if (event) {
      const gameEvent = event as GameEvent;
      trackMatchEventPublish(gameEvent.metadata.matchId, eventBus.publish(gameEvent));
    }
  } catch (error) {
    console.error(`[handlers/common] 发布 GameEvent 失败:`, (error as Error).message);
  }
}

function completed(state: StepState, stepId: string) {
  return { status: 'COMPLETED', state: markStepComplete(state, stepId) };
}

function isDone(state: StepState, stepId: string): boolean {
  return Boolean(state.completedSteps?.[stepId]);
}

function markStepComplete(state: StepState, stepId: string): StepState {
  return {
    ...state,
    completedSteps: { ...(state.completedSteps || {}), [stepId]: true }
  };
}

export {
  createWerewolfEvent,
  publishGameEvent,
  completed,
  isDone,
  markStepComplete
};

export type { WerewolfEvent, StepState };
