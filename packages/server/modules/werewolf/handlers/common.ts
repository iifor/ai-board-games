import { serializeWerewolfState } from '../runtime';
import type { ChannelType } from '@ai-presenter/shared/types/channelTypes';
import { CHANNEL_TYPES } from '@ai-presenter/shared/types/channelTypes';
import type { WerewolfEventBus } from '../eventBus';
import type { GameEventBuilder } from '../gameEventBuilder';

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
  options: { channel?: ChannelType; scopeKey?: string } = {}
): WerewolfEvent {
  const channel = options.channel || CHANNEL_TYPES.PUBLIC;
  return {
    type: workflowEvent,
    payload: {
      stepId: step.id,
      workflowEvent,
      message,
      game: serializeWerewolfState(match, state),
      channel,
      scopeKey: options.scopeKey,
      ...extra
    },
    idempotencyKey: `${match.id}:${step.id}:${workflowEvent}`,
    channel,
    scopeKey: options.scopeKey
  };
}

// ============================================================
// Phase 4: EventBus 双写助手
// ============================================================

/**
 * 通过 EventBus 发布 GameEvent（双写路径，不影响传统事件流）
 * 如果 eventBus/gameEventBuilder 不可用则静默跳过
 */
function publishGameEvent(
  eventBus: WerewolfEventBus | undefined,
  gameEventBuilder: GameEventBuilder | undefined,
  builderFn: (builder: GameEventBuilder) => unknown,
): void {
  if (!eventBus || !gameEventBuilder) return;
  try {
    const event = builderFn(gameEventBuilder);
    if (event) eventBus.publish(event as Parameters<WerewolfEventBus['publish']>[0]);
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
