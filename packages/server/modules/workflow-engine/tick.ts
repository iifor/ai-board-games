import { getDbExecutor } from '../../db';
import * as repo from './repository';
import { getWorkflow, getStepHandler } from './workflowRegistry';
import { evaluateCondition } from './condition';
import { hydrateMatchFromEventStore } from './projection';
import { buildStateTransitionEvents } from './stateTransition';
import { resolveBlockers } from './blockerResolution';
import { evaluateDebugBreakpoint } from './debugBreakpoint';
import type { ConditionContext } from './condition';
import { MATCH_STATUS } from '@ai-presenter/shared/types/workflowTypes';
import { toJson } from './utils';
import type { Match, StepBlocker } from '../../types/workflow';
import type { WorkflowStep, StepHandlerExecuteResult } from './workflowRegistry';
import type { DbExecutor } from '../../db/types';

interface TickBudget { maxSteps?: number; maxDurationMs?: number; maxEventsApplied?: number; maxInterruptsProcessed?: number }
const DEFAULT_BUDGET: Required<TickBudget> = { maxSteps: 20, maxDurationMs: 300, maxEventsApplied: 100, maxInterruptsProcessed: 0 };
const TERMINAL_STATUSES: string[] = [MATCH_STATUS.COMPLETED, MATCH_STATUS.FAILED, MATCH_STATUS.PAUSED_DEBUG];

async function tickMatch(matchId: string, budget: TickBudget = {}, db: DbExecutor = getDbExecutor()): Promise<Match> {
  const limits = { ...DEFAULT_BUDGET, ...budget };
  const started = Date.now();
  return db.withTransaction(async (transaction) => {
    let match = await repo.getMatch(matchId, transaction, true);
    if (!match) throw new Error(`Match not found: ${matchId}`);
    match = await hydrateMatchFromEventStore(match, transaction);
    if (TERMINAL_STATUSES.includes(match.status)) return match;

    const workflow = getWorkflow(match.workflowId);
    let stepsProcessed = 0;
    let state: Record<string, unknown> = match.state || {};
    let blockers: StepBlocker[] = [];
    let status: string = MATCH_STATUS.RUNNING;
    let currentStepIndex = Number(match.currentStepIndex || 0);

    while (stepsProcessed < limits.maxSteps && Date.now() - started <= limits.maxDurationMs) {
      const step: WorkflowStep | undefined = workflow.steps[currentStepIndex];
      if (!step) {
        status = MATCH_STATUS.COMPLETED;
        await repo.commitWorkflowChange({ matchId, events: [{ type: 'match_completed', payload: {},
          idempotencyKey: `${matchId}:match_completed` }] }, transaction);
        break;
      }
      const conditionContext: ConditionContext = {
        config: match.config, publicState: (state.publicState || state) as Record<string, unknown>,
        stepState: (state.stepState || {}) as Record<string, unknown>, round: state.round || null,
        phaseId: step.id, stepId: step.id,
      };
      if (step.condition && !evaluateCondition(step.condition as never, conditionContext)) {
        await repo.commitWorkflowChange({ matchId, events: [{ type: 'step_skipped', stepId: step.id,
          payload: { step }, idempotencyKey: `${matchId}:${step.id}:skipped` }] }, transaction);
        currentStepIndex += 1; stepsProcessed += 1; continue;
      }

      const breakpoint = await evaluateDebugBreakpoint(match, step, transaction);
      if (breakpoint.kind === 'pause') { status = MATCH_STATUS.WAITING; break; }
      if (breakpoint.kind === 'skip') {
        await repo.commitWorkflowChange({ matchId, events: [{ type: 'step_skipped', stepId: step.id,
          payload: { reason: 'undercover_debug_skip' }, visibility: 'system',
          idempotencyKey: `${matchId}:${step.id}:debug-skipped` }] }, transaction);
        currentStepIndex += 1; stepsProcessed += 1; continue;
      }

      const previousState = structuredClone(state);
      const handler = getStepHandler(match.workflowId, step.type);
      const result: StepHandlerExecuteResult = await handler.execute({
        match: match as unknown as Record<string, unknown>, workflow, step, state, db: transaction,
      });
      if (result.status === 'FAILED') {
        const failed = await repo.commitWorkflowChange({ matchId, matchPatch: {
          status: MATCH_STATUS.FAILED, error_json: toJson(result.error || { message: 'Step failed' }),
          state_json: toJson(state), blockers_json: toJson([]),
        }, snapshot: true }, transaction);
        return failed.match;
      }

      state = result.state || state;
      const requestedIndex = result.nextStepId ? workflow.steps.findIndex((item) => item.id === result.nextStepId) : -1;
      if (result.nextStepId && requestedIndex < 0) throw new Error(`Workflow step not found: ${result.nextStepId}`);
      const nextStepIndex = requestedIndex >= 0 ? requestedIndex : currentStepIndex + 1;
      const projectedEvents = buildStateTransitionEvents({ matchId, stepId: step.id,
        matchVersion: Number(match.version || 0), currentStepIndex, nextStepIndex,
        previousState, nextState: state, result });
      if (projectedEvents.length) await repo.commitWorkflowChange({ matchId, events: projectedEvents }, transaction);
      for (const task of result.tasks || []) await repo.createAiTask(task as never, transaction);
      for (const action of result.pendingActions || []) await repo.createPendingAction(action as never, transaction);

      if (result.status === 'WAITING') {
        blockers = await resolveBlockers(matchId, (result.blockers || []) as unknown as StepBlocker[], transaction);
        status = MATCH_STATUS.WAITING; break;
      }
      if (result.matchStatus === MATCH_STATUS.COMPLETED) {
        status = MATCH_STATUS.COMPLETED; currentStepIndex = workflow.steps.length; blockers = []; break;
      }
      currentStepIndex = nextStepIndex;
      stepsProcessed += 1;
    }

    const snapshot = await repo.shouldCreateSnapshot(matchId, status, transaction);
    const updated = await repo.commitWorkflowChange({ matchId, matchPatch: {
      status, current_step_index: currentStepIndex, version: Number(match.version || 0) + 1,
      state_json: toJson(state), blockers_json: toJson(blockers),
      completed_at: status === MATCH_STATUS.COMPLETED ? new Date().toISOString() : match.completedAt || null,
    }, snapshot }, transaction);
    return updated.match;
  }, { isolationLevel: 'serializable' });
}

export { tickMatch, resolveBlockers };
