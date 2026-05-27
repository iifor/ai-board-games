import { serializeWerewolfState } from '../runtime';
import type { ChannelType } from '@ai-presenter/shared/types/channelTypes';
import { CHANNEL_TYPES } from '@ai-presenter/shared/types/channelTypes';

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
  completed,
  isDone,
  markStepComplete
};

export type { WerewolfEvent, StepState };
