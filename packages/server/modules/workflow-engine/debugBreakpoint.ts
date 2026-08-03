import type { Match } from '../../types/workflow';
import type { WorkflowStep } from './workflowRegistry';
import * as repo from './repository';

type DebugBreakpointDecision =
  | { kind: 'run' }
  | { kind: 'pause'; interruptId: string }
  | { kind: 'skip'; interruptId: string };

const UNDERCOVER_DEBUG_BREAKPOINT = 'undercover_debug_breakpoint';

function evaluateDebugBreakpoint(match: Match, step: WorkflowStep): DebugBreakpointDecision {
  const config = (step.config || {}) as Record<string, unknown>;
  if (
    match.gameType !== 'undercover'
    || match.config.debugMode !== true
    || match.config.debugRunMode === 'continuous'
    || config.debugBreakpoint !== true
  ) {
    return { kind: 'run' };
  }

  let interrupt = repo.listWorkflowInterrupts(match.id).find((item) =>
    item.interruptType === UNDERCOVER_DEBUG_BREAKPOINT && item.stepId === step.id
  );
  if (!interrupt) {
    interrupt = repo.createWorkflowInterrupt({
      id: `${match.id}:${step.id}:debug-breakpoint`,
      matchId: match.id,
      stepId: step.id,
      interruptType: UNDERCOVER_DEBUG_BREAKPOINT,
      status: 'pending',
      payload: {},
    }) || undefined;
  }
  if (!interrupt) throw new Error(`Failed to create Undercover debug breakpoint: ${step.id}`);
  if (interrupt.status === 'pending') return { kind: 'pause', interruptId: interrupt.id };
  if (interrupt.status === 'skipped') return { kind: 'skip', interruptId: interrupt.id };
  return { kind: 'run' };
}

export { UNDERCOVER_DEBUG_BREAKPOINT, evaluateDebugBreakpoint };
export type { DebugBreakpointDecision };
