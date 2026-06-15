import { getDb } from '../../db';
import { performance } from 'perf_hooks';
import * as repo from './repository';
import { getWorkflow, getStepHandler } from './workflowRegistry';
import { evaluateCondition } from './condition';
import { hydrateMatchFromEventStore } from './projection';
import { buildStateTransitionEvents } from './stateTransition';
import { resolveBlockers } from './blockerResolution';
import type { ConditionContext } from './condition';
import { MATCH_STATUS } from '@ai-presenter/shared/types/workflowTypes';
import { toJson } from './utils';
import {
  createPersistenceTiming,
  measureStage,
  addStageDuration,
  addBytes,
  finishPersistenceTiming,
} from './persistenceTiming';
import type { PersistenceTiming } from './persistenceTiming';
import type { Match, StepBlocker } from '../../types/workflow';
import type { Workflow, WorkflowStep, StepHandlerExecuteResult } from './workflowRegistry';

interface TickBudget {
  maxSteps?: number;
  maxDurationMs?: number;
  maxEventsApplied?: number;
  maxInterruptsProcessed?: number;
}

const DEFAULT_BUDGET: Required<TickBudget> = {
  maxSteps: 20,
  maxDurationMs: 300,
  maxEventsApplied: 100,
  maxInterruptsProcessed: 0,
};

const TERMINAL_STATUSES: string[] = [MATCH_STATUS.COMPLETED, MATCH_STATUS.FAILED, MATCH_STATUS.PAUSED_DEBUG];

function tickMatch(matchId: string, budget: TickBudget = {}): Match {
  const limits = { ...DEFAULT_BUDGET, ...budget };
  const started = Date.now();
  const correlationId = `${matchId}:tick:${started}`;
  let timing: PersistenceTiming | null = null;
  let transactionCallbackEndedAt = 0;
  let summary: Record<string, unknown> = {};
  const execute = getDb().transaction(() => {
    try {
    let match = repo.getMatch(matchId);
    if (!match) throw new Error(`Match not found: ${matchId}`);
    timing = createPersistenceTiming(
      correlationId,
      matchId,
      'tickMatch',
      Boolean(match.config?.debugMode),
    );
    match = measureStage(timing, 'hydrateStateMs', () => hydrateMatchFromEventStore(match!));
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
        repo.commitWorkflowChange({
          matchId,
          events: [{
            type: 'match_completed',
            payload: {},
            idempotencyKey: `${matchId}:match_completed`,
          }],
          timing: { correlationId, operation: 'matchCompleted', debugMode: Boolean(match.config?.debugMode) },
        });
        break;
      }

      const conditionContext: ConditionContext = {
        config: match.config,
        publicState: (state.publicState || state) as Record<string, unknown>,
        stepState: (state.stepState || {}) as Record<string, unknown>,
        round: state.round || null,
        phaseId: step.id,
        stepId: step.id,
      };
      if (step.condition && !evaluateCondition(step.condition as never, conditionContext)) {
        repo.commitWorkflowChange({
          matchId,
          events: [{
            type: 'step_skipped',
            stepId: step.id,
            payload: { step },
            idempotencyKey: `${matchId}:${step.id}:skipped`,
          }],
          timing: { correlationId, operation: 'stepSkipped', debugMode: Boolean(match.config?.debugMode) },
        });
        currentStepIndex += 1;
        stepsProcessed += 1;
        continue;
      }

      const handler = getStepHandler(match.workflowId, step.type);
      const previousState = measureStage(
        timing,
        'statePatchBaselineCloneMs',
        () => structuredClone(state),
      );
      const result: StepHandlerExecuteResult = measureStage(
        timing,
        'handlerExecuteMs',
        () => handler.execute({
          match: match as unknown as Record<string, unknown>,
          workflow,
          step,
          state,
        }),
      );
      if (result.status === 'FAILED') {
        status = MATCH_STATUS.FAILED;
        const failedStateJson = measureStage(timing, 'stateSerializeMs', () => toJson(state));
        const failedBlockersJson = measureStage(timing, 'blockersSerializeMs', () => toJson([]));
        const { match: failedMatch } = repo.commitWorkflowChange({
          matchId,
          matchPatch: {
            status,
            error_json: toJson(result.error || { message: 'Step failed' }),
            state_json: failedStateJson,
            blockers_json: failedBlockersJson,
          },
          snapshot: true,
          timing: {
            correlationId,
            operation: 'tickFailedCommit',
            debugMode: Boolean(match.config?.debugMode),
          },
        });
        summary = { status, stepsProcessed, snapshotWritten: true };
        return failedMatch;
      }

      state = result.state || state;
      const requestedStepIndex = result.nextStepId
        ? workflow.steps.findIndex((candidate) => candidate.id === result.nextStepId)
        : -1;
      if (result.nextStepId && requestedStepIndex < 0) {
        throw new Error(`Workflow step not found: ${result.nextStepId}`);
      }
      const nextStepIndex = requestedStepIndex >= 0
        ? requestedStepIndex
        : currentStepIndex + 1;
      const projectedEvents = buildStateTransitionEvents({
        matchId,
        stepId: step.id,
        matchVersion: Number(match.version || 0),
        currentStepIndex,
        nextStepIndex,
        previousState,
        nextState: state,
        result,
      });
      if (projectedEvents.length) repo.commitWorkflowChange({
        matchId,
        events: projectedEvents,
        timing: { correlationId, operation: 'stepEvents', debugMode: Boolean(match.config?.debugMode) },
      });
      if (result.tasks?.length) {
        for (const task of result.tasks) repo.createAiTask(task as never);
      }
      if (result.pendingActions?.length) {
        for (const action of result.pendingActions) repo.createPendingAction(action as never);
      }

      if (result.status === 'WAITING') {
        blockers = resolveBlockers(matchId, (result.blockers || []) as unknown as StepBlocker[]);
        status = MATCH_STATUS.WAITING;
        break;
      }

      // Step handlers can explicitly finish the match before the workflow step
      // list is exhausted, for games where a win condition may occur mid-loop.
      if (result.matchStatus === MATCH_STATUS.COMPLETED) {
        status = MATCH_STATUS.COMPLETED;
        currentStepIndex = workflow.steps.length;
        blockers = [];
        break;
      }

      currentStepIndex = nextStepIndex;
      stepsProcessed += 1;
    }

    const version = Number(match.version || 0) + 1;
    const stateJson = measureStage(timing, 'stateSerializeMs', () => toJson(state));
    const blockersJson = measureStage(timing, 'blockersSerializeMs', () => toJson(blockers));
    addBytes(timing, 'matchStateBytes', stateJson);
    addBytes(timing, 'matchBlockersBytes', blockersJson);
    const snapshot = repo.shouldCreateSnapshot(matchId, status);
    const { match: updated } = repo.commitWorkflowChange({
      matchId,
      matchPatch: {
        status,
        current_step_index: currentStepIndex,
        version,
        state_json: stateJson,
        blockers_json: blockersJson,
        completed_at: status === MATCH_STATUS.COMPLETED ? new Date().toISOString() : match.completedAt || null,
      },
      snapshot,
      timing: { correlationId, operation: 'tickFinalCommit', debugMode: Boolean(match.config?.debugMode) },
    });
    summary = {
      status,
      stepsProcessed,
      snapshotWritten: snapshot,
      elapsedWallMs: Date.now() - started,
    };
    return updated;
    } finally {
      transactionCallbackEndedAt = performance.now();
    }
  });
  const transactionStartedAt = performance.now();
  try {
    const result = execute() as Match;
    if (timing) {
      const transactionReturnedAt = performance.now();
      addStageDuration(
        timing,
        'transactionCommitMs',
        Math.max(0, transactionReturnedAt - transactionCallbackEndedAt),
      );
      addStageDuration(timing, 'transactionTotalMs', transactionReturnedAt - transactionStartedAt);
      finishPersistenceTiming(timing, summary);
    }
    return result;
  } catch (error) {
    if (timing) {
      addStageDuration(timing, 'transactionTotalMs', performance.now() - transactionStartedAt);
      finishPersistenceTiming(timing, {
        ...summary,
        error: (error as Error).message,
      });
    }
    throw error;
  }
}

export { tickMatch, resolveBlockers };
