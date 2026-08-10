import type { Match } from '../../types/workflow';
import type { WorkflowStep } from './workflowRegistry';
import * as repo from './repository';
import { getDbExecutor } from '../../db';
import type { DbExecutor } from '../../db/types';

type DebugBreakpointDecision =
  | { kind: 'run' }
  | { kind: 'pause'; interruptId: string }
  | { kind: 'skip'; interruptId: string };

const UNDERCOVER_DEBUG_BREAKPOINT = 'undercover_debug_breakpoint';

async function evaluateDebugBreakpoint(
  match: Match,
  step: WorkflowStep,
  db: DbExecutor = getDbExecutor(),
): Promise<DebugBreakpointDecision> {
  const config = (step.config || {}) as Record<string, unknown>;
  if (
    match.gameType !== 'undercover'
    || match.config.debugMode !== true
    || match.config.debugRunMode === 'continuous'
    || config.debugBreakpoint !== true
  ) {
    return { kind: 'run' };
  }

  let interrupt = (await repo.listWorkflowInterrupts(match.id, db)).find((item) =>
    item.interruptType === UNDERCOVER_DEBUG_BREAKPOINT && item.stepId === step.id
  );
  if (!interrupt) {
    interrupt = await repo.createWorkflowInterrupt({
      id: `${match.id}:${step.id}:debug-breakpoint`,
      matchId: match.id,
      stepId: step.id,
      interruptType: UNDERCOVER_DEBUG_BREAKPOINT,
      status: 'pending',
      payload: { stepType: step.type },
    }, db) || undefined;
  }
  if (!interrupt) throw new Error(`Failed to create Undercover debug breakpoint: ${step.id}`);
  switch (interrupt.status) {
    case 'pending':
      return { kind: 'pause', interruptId: interrupt.id };
    case 'skipped':
      return { kind: 'skip', interruptId: interrupt.id };
    case 'resolved':
      return { kind: 'run' };
    default:
      throw new Error(
        `Unknown Undercover debug breakpoint status: ${interrupt.status}`,
      );
  }
}

export { UNDERCOVER_DEBUG_BREAKPOINT, evaluateDebugBreakpoint };
export type { DebugBreakpointDecision };
