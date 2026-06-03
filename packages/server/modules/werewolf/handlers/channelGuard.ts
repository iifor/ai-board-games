import { CHANNEL_TYPES } from '@ai-presenter/shared/types/channelTypes';
import type { ChannelType } from '@ai-presenter/shared/types/channelTypes';
import { resolveActionChannel } from './actionChannel';

interface ChannelGuardInput {
  workflowEvent: string;
  payload: Record<string, unknown>;
  channel?: ChannelType;
  scopeKey?: string;
}

interface ChannelGuardResult {
  channel: ChannelType;
  scopeKey?: string;
  invariantIssues?: Array<{ code: string; message: string }>;
}

const GUARDED_PRIVATE_EVENTS = new Set([
  'werewolf_action_submitted',
  'werewolf_phase_result',
]);

const PRIVATE_PAYLOAD_KEYS = new Set([
  'seerResult',
  'guardTarget',
  'witchSaveUsed',
  'witchPoisonUsed',
  'wolfTarget',
]);

function guardWerewolfWorkflowEventChannel(input: ChannelGuardInput): ChannelGuardResult {
  const actionType = String(input.payload.actionType || '');
  const requested: ChannelGuardResult = {
    channel: input.channel || CHANNEL_TYPES.PUBLIC,
    scopeKey: input.scopeKey,
  };
  const expected = resolveActionChannel(actionType);
  const expectsScope = expected.channel === CHANNEL_TYPES.SCOPE && Boolean(expected.scopeKey);
  if (!expectsScope) return requested;

  const mustBePrivate = GUARDED_PRIVATE_EVENTS.has(input.workflowEvent) || hasPrivatePayload(input.payload);
  if (!mustBePrivate) return requested;

  const issues: ChannelGuardResult['invariantIssues'] = [];
  if (requested.channel !== expected.channel || requested.scopeKey !== expected.scopeKey) {
    issues.push({
      code: 'PRIVATE_ACTION_CHANNEL_MISMATCH',
      message: `${input.workflowEvent}:${actionType} must use ${expected.channel}:${expected.scopeKey}`,
    });
  }

  return {
    channel: expected.channel,
    scopeKey: expected.scopeKey,
    invariantIssues: issues.length ? issues : undefined,
  };
}

function hasPrivatePayload(payload: Record<string, unknown>): boolean {
  return Object.keys(payload).some((key) => PRIVATE_PAYLOAD_KEYS.has(key));
}

export {
  guardWerewolfWorkflowEventChannel,
};

export type {
  ChannelGuardInput,
  ChannelGuardResult,
};
