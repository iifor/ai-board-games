import type {
  ActionWindowSnapshot,
  DomainAction,
  DomainEvent,
  EngineStoreDebugState,
  InvariantIssue,
  MatchSnapshot,
  WorkflowEffect,
} from '@ai-presenter/shared/types/gameEngine';
import { ChannelSystem } from '../channel/channelSystem';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'paused_debug']);

function assertCanTick(match: MatchSnapshot | null): void {
  if (!match) throw new Error('Match not found.');
  if (TERMINAL_STATUSES.has(match.status)) {
    throw new Error(`Match cannot continue while status is ${match.status}.`);
  }
}

function checkActionWindowInvariant(action: DomainAction, window: ActionWindowSnapshot | null): InvariantIssue[] {
  const issues: InvariantIssue[] = [];
  if (!window) {
    issues.push(error('ACTION_WINDOW_NOT_FOUND', `ActionWindow not found: ${action.windowId}`));
    return issues;
  }
  if (window.status !== 'open') {
    issues.push(error('ACTION_WINDOW_CLOSED', `ActionWindow is not open: ${action.windowId}`));
  }
  if (window.actionType !== action.actionType) {
    issues.push(error('ACTION_TYPE_MISMATCH', `Action type ${action.actionType} does not match ${window.actionType}`));
  }
  if (window.actorIds.length && !window.actorIds.some((id) => String(id) === String(action.actorId))) {
    issues.push(error('ACTOR_NOT_ALLOWED', `Actor ${action.actorId} is not allowed in window ${window.id}`));
  }
  return issues;
}

function checkEventChannelInvariant(events: Array<Partial<DomainEvent>>): InvariantIssue[] {
  const channelSystem = new ChannelSystem();
  return events.flatMap((event) => {
    const result = channelSystem.validateEvent(event);
    return result.ok ? [] : [error(result.error!.code, result.error!.message, {
      subjectType: 'event',
      subjectId: event.id,
      details: event,
    })];
  });
}

function checkEffectLifecycleInvariant(effect: WorkflowEffect): InvariantIssue[] {
  const subject = { subjectType: 'effect' as const, subjectId: effect.id };
  if (effect.status !== 'applied' && effect.appliedEventSeq) {
    return [error('EFFECT_SEQ_WITHOUT_APPLY', `Effect ${effect.id} has appliedEventSeq without applied status.`, subject)];
  }
  if (effect.status === 'applied' && !effect.appliedEventSeq) {
    return [error('EFFECT_APPLIED_WITHOUT_SEQ', `Applied effect ${effect.id} must reference appliedEventSeq.`, subject)];
  }
  return [];
}

function checkDuplicateEventIdempotencyInvariant(events: DomainEvent[]): InvariantIssue[] {
  const seen = new Map<string, DomainEvent>();
  const issues: InvariantIssue[] = [];
  for (const event of events) {
    if (!event.idempotencyKey) continue;
    const first = seen.get(event.idempotencyKey);
    if (first) {
      issues.push(error(
        'DUPLICATE_EVENT_IDEMPOTENCY_KEY',
        `Duplicate event idempotencyKey detected: ${event.idempotencyKey}`,
        {
          subjectType: 'event',
          subjectId: event.id,
          details: { firstEventId: first.id, duplicateEventId: event.id, idempotencyKey: event.idempotencyKey },
        },
      ));
      continue;
    }
    seen.set(event.idempotencyKey, event);
  }
  return issues;
}

function collectEngineInvariants(debugState: EngineStoreDebugState): InvariantIssue[] {
  return [
    ...checkEventChannelInvariant(debugState.events),
    ...debugState.effects.flatMap(checkEffectLifecycleInvariant),
    ...checkDuplicateEventIdempotencyInvariant(debugState.events),
  ];
}

function checkUnappliedEffectInvariant(effect: WorkflowEffect): InvariantIssue[] {
  return checkEffectLifecycleInvariant(effect);
}

function error(
  code: string,
  message: string,
  options: { subjectType?: InvariantIssue['subjectType']; subjectId?: string; details?: unknown } = {},
): InvariantIssue {
  return {
    code,
    message,
    subjectType: options.subjectType,
    subjectId: options.subjectId,
    details: options.details,
    severity: 'error',
  };
}

export {
  assertCanTick,
  checkActionWindowInvariant,
  checkEventChannelInvariant,
  checkEffectLifecycleInvariant,
  checkDuplicateEventIdempotencyInvariant,
  collectEngineInvariants,
  checkUnappliedEffectInvariant,
};
