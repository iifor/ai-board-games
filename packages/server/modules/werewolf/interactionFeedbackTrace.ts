import { CHANNEL_TYPES } from '@ai-presenter/shared/types/channelTypes';
import type { ChannelType } from '@ai-presenter/shared/types/channelTypes';
import { getActiveTrace, recordEvent } from '../observability/tracer';

const WEREWOLF_INTERACTION_FEEDBACK_EVENT = 'werewolf_interaction_feedback';

type InteractionFeedbackActionType =
  | 'seer_check'
  | 'guard_protect'
  | 'witch_save'
  | 'witch_poison'
  | 'hunter_shot';

interface InteractionFeedbackInput {
  matchId: string;
  actionType?: string;
  actorId?: number | string | null;
  payload?: Record<string, unknown> | null;
  round?: Record<string, unknown> | null;
  day?: number;
  phase?: string;
  reason?: string | null;
}

interface InteractionFeedbackEvent extends Record<string, unknown> {
  type: typeof WEREWOLF_INTERACTION_FEEDBACK_EVENT;
  matchId: string;
  actionType: InteractionFeedbackActionType;
  feedbackKind: string;
  actorId: number | null;
  target: number | null;
  result: string;
  day?: number;
  phase?: string;
  channel: ChannelType;
  scopeKey?: string;
  visibleTo: string[];
  used?: boolean;
  wolfTarget?: number | null;
  triggerReason?: string | null;
}

function buildWerewolfInteractionFeedbackEvent(input: InteractionFeedbackInput): InteractionFeedbackEvent | null {
  const actionType = input.actionType as InteractionFeedbackActionType | undefined;
  if (!actionType || !isFeedbackAction(actionType)) return null;

  const payload = input.payload || {};
  const night = ((input.round as { night?: Record<string, unknown> } | null | undefined)?.night) || {};
  const common: Pick<InteractionFeedbackEvent, 'type' | 'matchId' | 'actionType' | 'actorId' | 'day' | 'phase'> = {
    type: WEREWOLF_INTERACTION_FEEDBACK_EVENT,
    matchId: input.matchId,
    actionType,
    actorId: toNumber(input.actorId),
    day: toNumber(payload.day) ?? input.day,
    phase: input.phase,
  };

  if (actionType === 'seer_check') {
    return {
      ...common,
      feedbackKind: 'seer_check_result',
      target: toNumber(payload.target),
      result: String(payload.result || payload.faction || 'unknown'),
      channel: CHANNEL_TYPES.SCOPE,
      scopeKey: 'seer',
      visibleTo: ['role:seer', 'system'],
    };
  }

  if (actionType === 'guard_protect') {
    const target = toNumber(payload.target);
    return {
      ...common,
      feedbackKind: 'guard_protect_result',
      target,
      result: target != null ? 'protected' : 'skipped',
      channel: CHANNEL_TYPES.SCOPE,
      scopeKey: 'guard',
      visibleTo: ['role:guard', 'system'],
    };
  }

  if (actionType === 'witch_save') {
    const used = payload.use === true;
    const wolfTarget = toNumber(night.wolfTarget);
    const target = used ? (toNumber(payload.target) ?? wolfTarget) : null;
    return {
      ...common,
      feedbackKind: 'witch_save_result',
      target,
      result: used ? 'saved' : 'skipped',
      channel: CHANNEL_TYPES.SCOPE,
      scopeKey: 'witch',
      visibleTo: ['role:witch', 'system'],
      used,
      wolfTarget,
    };
  }

  if (actionType === 'witch_poison') {
    const target = toNumber(payload.target);
    const used = payload.use === true && target != null;
    return {
      ...common,
      feedbackKind: 'witch_poison_result',
      target: used ? target : null,
      result: used ? 'poisoned' : 'skipped',
      channel: CHANNEL_TYPES.SCOPE,
      scopeKey: 'witch',
      visibleTo: ['role:witch', 'system'],
      used,
    };
  }

  const target = toNumber(payload.target);
  return {
    ...common,
    feedbackKind: 'hunter_shot_result',
    target,
    result: target != null ? 'shot' : 'skipped',
    channel: CHANNEL_TYPES.PUBLIC,
    visibleTo: ['public', 'system'],
    triggerReason: input.reason || String(payload.reason || ''),
  };
}

function recordWerewolfInteractionFeedback(input: InteractionFeedbackInput): void {
  try {
    const event = buildWerewolfInteractionFeedbackEvent(input);
    if (!event) return;
    const trace = getActiveTrace(input.matchId);
    if (!trace) return;
    recordEvent(trace, event);
  } catch {
    // Trace is diagnostic only; never affect the game workflow.
  }
}

function isFeedbackAction(actionType: string): actionType is InteractionFeedbackActionType {
  return actionType === 'seer_check'
    || actionType === 'guard_protect'
    || actionType === 'witch_save'
    || actionType === 'witch_poison'
    || actionType === 'hunter_shot';
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export {
  WEREWOLF_INTERACTION_FEEDBACK_EVENT,
  buildWerewolfInteractionFeedbackEvent,
  recordWerewolfInteractionFeedback,
};

export type {
  InteractionFeedbackEvent,
  InteractionFeedbackInput,
};
