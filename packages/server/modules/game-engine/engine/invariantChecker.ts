import type {
  ActionWindowSnapshot,
  DomainAction,
  DomainEvent,
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
    return result.ok ? [] : [error(result.error!.code, result.error!.message, event)];
  });
}

function checkUnappliedEffectInvariant(effect: WorkflowEffect): InvariantIssue[] {
  if (effect.status !== 'applied' && effect.appliedEventSeq) {
    return [error('EFFECT_SEQ_WITHOUT_APPLY', `Effect ${effect.id} has appliedEventSeq without applied status.`)];
  }
  return [];
}

function error(code: string, message: string, details?: unknown): InvariantIssue {
  return { code, message, details, severity: 'error' };
}

export {
  assertCanTick,
  checkActionWindowInvariant,
  checkEventChannelInvariant,
  checkUnappliedEffectInvariant,
};
