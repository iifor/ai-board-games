import type { WorkflowStep } from '../workflow-engine/workflowRegistry';
import { createAvalonPresentationEvent } from './presentation';
import type { AvalonWorkflowState } from './types';

function completeStep(state: AvalonWorkflowState, stepId: string): AvalonWorkflowState {
  return { ...state, completedSteps: { ...(state.completedSteps || {}), [stepId]: true } };
}

function isComplete(state: AvalonWorkflowState, stepId: string): boolean {
  return Boolean(state.completedSteps?.[stepId]);
}

function done(state: AvalonWorkflowState, events: Record<string, unknown>[] = []) {
  return { status: 'COMPLETED' as const, state, ...(events.length ? { events } : {}) };
}

function publicEvent(
  matchId: string,
  stepId: string,
  type: string,
  state: AvalonWorkflowState,
  message: string,
  details: Record<string, unknown> = {},
) {
  return {
    type,
    visibility: 'public',
    channel: 'public',
    payload: createAvalonPresentationEvent(type, state, message, details),
    idempotencyKey: `${matchId}:${stepId}:${type}`,
  };
}

function stepNumber(step: WorkflowStep, key: 'mission' | 'attempt'): number {
  return Number((step.config as Record<string, unknown> | undefined)?.[key] || 0);
}

function stepId(mission: number, attempt: number, phase: 'propose' | 'team_vote' | 'quest'): string {
  return `mission_${mission}_attempt_${attempt}_${phase}`;
}

export { completeStep, done, isComplete, publicEvent, stepId, stepNumber };
