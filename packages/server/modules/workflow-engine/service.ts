import * as repo from './repository';
import type { CommitChangeInput, CommitChangeResult } from './repository';
import { requestInterrupt, resolveInterrupt } from './effects';
import { getDbExecutor } from '../../db';
import { tickMatch } from './tick';
import { processClaimedAiTask } from './aiTaskWorker';
import { getWorkflow } from './workflowRegistry';
import { createId, nowIso, toJson } from './utils';
import { MATCH_STATUS } from '@ai-presenter/shared/types/workflowTypes';
import type { Match, AiTask } from '../../types/workflow';
import { cleanupTerminalDebugMatches, scheduleWorkflowMaintenance } from './debugRetention';
import { UNDERCOVER_DEBUG_BREAKPOINT } from './debugBreakpoint';
import { AppError, ErrorCodes } from '../../utils/errors';
import { deleteMatchCascade } from './debugRetentionRepository';
import { deleteTracesByGameId } from '../observability/db';
import {
  cleanupGameFiles,
  deleteGameRecords,
  prepareGameDeletion,
} from '../games/service';

const MAX_AI_ATTEMPTS = 2;

const TERMINAL_STATUSES: string[] = [MATCH_STATUS.COMPLETED, MATCH_STATUS.FAILED, MATCH_STATUS.PAUSED_DEBUG];
const UNDERCOVER_DEBUG_ACTIONS = new Set(['continue', 'skip', 'continuous']);

type UndercoverDebugAction = 'continue' | 'skip' | 'continuous';

interface UndercoverDebugControlInput {
  matchId: string;
  interruptId: string;
  action: UndercoverDebugAction;
}

interface CreateMatchInput {
  workflowId: string;
  gameType?: string;
  config?: Record<string, unknown>;
  initialState?: Record<string, unknown>;
  matchId?: string;
}

interface AiTaskResult {
  eventType?: string;
  rawOutput?: unknown;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

interface AiTaskError {
  message?: string;
  severity?: string;
}

interface SubmitPendingActionInput {
  matchId: string;
  actionId: string;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
}

interface DrainOptions {
  maxTasks?: number;
  workerId?: string;
}

interface WorkflowMatchDeletionResult {
  matchId: string;
  deleted: {
    match: boolean;
    game: boolean;
    traces: number;
  };
}

async function createWorkflowMatch({ workflowId, gameType, config, initialState, matchId }: CreateMatchInput): Promise<Match> {
  const workflow = getWorkflow(workflowId);
  const id = matchId || createId(gameType || workflow.gameType || 'match');
  await repo.createMatch({
    id,
    game_type: gameType || workflow.gameType || 'unknown',
    workflow_id: workflowId,
    status: MATCH_STATUS.RUNNING,
    current_step_index: 0,
    version: 0,
    config_json: toJson(config || {}),
    state_json: toJson(initialState || {}),
    blockers_json: '[]',
    error_json: 'null',
    created_at: nowIso(),
    updated_at: nowIso(),
    completed_at: null,
  });
  await repo.commitWorkflowChange({
    matchId: id,
    events: [{
      type: 'match_created',
      payload: { workflowId, gameType: gameType || workflow.gameType },
      idempotencyKey: `${id}:created`,
    }],
  });
  return await afterTick(await tickMatch(id));
}

async function wakeTick(matchId: string): Promise<Match> {
  return await afterTick(await tickMatch(matchId));
}

async function drainAiTasks(matchId: string, options: DrainOptions = {}): Promise<{ processed: number; match: Match | null }> {
  const maxTasks = Number(options.maxTasks || 100);
  const workerId = options.workerId || 'inline-worker';
  let processed = 0;
  while (processed < maxTasks) {
    const task = await claimNextAiTask({ matchId, workerId });
    if (!task) {
      const current = await repo.getMatch(matchId);
      if (!current || current.status !== MATCH_STATUS.RUNNING || current.blockers.length) break;
      const advanced = await wakeTick(matchId);
      if (advanced.status === current.status && advanced.currentStepIndex === current.currentStepIndex) break;
      processed += 1;
      if (TERMINAL_STATUSES.includes(advanced.status)) break;
      continue;
    }
    await processClaimedAiTask(task.id);
    processed += 1;
    const match = await repo.getMatch(matchId);
    if (!match || TERMINAL_STATUSES.includes(match.status)) break;
  }
  return { processed, match: await repo.getMatch(matchId) };
}

async function enqueueAiTask(task: Record<string, unknown>): Promise<AiTask | null> {
  await repo.createAiTask(task as never);
  return repo.getAiTask(task.id as string);
}

async function claimNextAiTask({ matchId = null, workerId = 'worker' }: { matchId?: string | null; workerId?: string } = {}): Promise<AiTask | null> {
  return repo.claimNextAiTask({ matchId, workerId });
}

async function completeAiTask(taskId: string, result: AiTaskResult | Record<string, unknown>): Promise<Match> {
  const task = await repo.getAiTask(taskId);
  if (!task) throw new Error(`AI task not found: ${taskId}`);
  if (task.status === 'succeeded') return await repo.getMatch(task.matchId) as Match;
  if (task.status === 'cancelled') throw new Error('AI task was cancelled');
  const payload = (result as AiTaskResult).payload || result;
  if (!payload || (typeof payload === 'object' && !Object.keys(payload as object).length)) {
    return await failAiTask(taskId, { message: 'AI task result payload is empty', severity: 'high' }) as Match;
  }
  await repo.updateAiTask(task.id, {
    status: 'succeeded',
    raw_output: typeof (result as AiTaskResult).rawOutput === 'string'
      ? (result as AiTaskResult).rawOutput
      : JSON.stringify((result as AiTaskResult).rawOutput ?? payload),
    result_json: toJson(result),
  });
  await repo.commitWorkflowChange({
    matchId: task.matchId,
    events: [{
      stepId: task.stepId,
      playerId: task.playerId,
      type: (result as AiTaskResult).eventType || 'ai_task_succeeded',
      payload,
      idempotencyKey: `${task.id}:result`,
      visibility: 'system',
    }],
  });
  try {
    return await wakeTick(task.matchId);
  } catch (error) {
    return pauseAfterSuccessfulAiAdvanceFailure(task, error);
  }
}

async function pauseAfterSuccessfulAiAdvanceFailure(task: AiTask, error: unknown): Promise<Match> {
  const message = error instanceof Error ? error.message : String(error);
  const failure = {
    message,
    taskId: task.id,
    severity: 'high',
    stage: 'wake_tick_after_ai_success',
  };
  const result = await repo.commitWorkflowChange({
    matchId: task.matchId,
    events: [{
      stepId: task.stepId,
      playerId: task.playerId,
      type: 'workflow_advance_failed',
      payload: failure,
      visibility: 'system',
      idempotencyKey: `${task.id}:workflow-advance-failed`,
    }],
    matchPatch: {
      status: MATCH_STATUS.PAUSED_DEBUG,
      error_json: toJson(failure),
    },
    snapshot: true,
  });
  console.error('[workflow-engine] AI result persisted but workflow advance failed', failure);
  await maybeCleanupTerminalDebugMatch(result.match);
  return result.match;
}

async function failAiTask(taskId: string, error: AiTaskError = {}): Promise<Match | AiTask> {
  const task = await repo.getAiTask(taskId);
  if (!task) throw new Error(`AI task not found: ${taskId}`);
  const message = error.message || String(error || 'AI task failed');
  const severity = error.severity || 'medium';
  const shouldPause = severity === 'critical' || severity === 'high' || Number(task.attempts || 0) >= MAX_AI_ATTEMPTS;
  await repo.updateAiTask(task.id, {
    status: shouldPause ? 'failed' : 'retrying',
    error_json: toJson({ message, severity }),
  });
  await repo.commitWorkflowChange({
    matchId: task.matchId,
    events: [{
      stepId: task.stepId,
      playerId: task.playerId,
      type: shouldPause ? 'ai_task_failed' : 'ai_task_retrying',
      payload: { taskId: task.id, message, severity, attempts: task.attempts },
      visibility: 'system',
      idempotencyKey: `${task.id}:${shouldPause ? 'failed' : `retrying-${task.attempts}`}`,
    }],
    matchPatch: shouldPause
      ? { status: MATCH_STATUS.PAUSED_DEBUG, error_json: toJson({ message, taskId: task.id, severity }) }
      : null,
    snapshot: shouldPause,
  });
  if (shouldPause) {
    const match = (await repo.getMatch(task.matchId))!;
    await maybeCleanupTerminalDebugMatch(match);
    return match;
  }
  return await repo.getAiTask(task.id) as AiTask;
}

async function retryAiTask(taskId: string): Promise<Match> {
  const task = await repo.retryAiTask(taskId);
  if (!task) throw new Error(`AI task not found: ${taskId}`);
  const match = await repo.getMatch(task.matchId);
  if (match?.status === MATCH_STATUS.PAUSED_DEBUG) {
    await repo.updateMatch(task.matchId, { status: MATCH_STATUS.WAITING, error_json: 'null' });
  }
  await repo.commitWorkflowChange({
    matchId: task.matchId,
    events: [{
      stepId: task.stepId,
      playerId: task.playerId,
      type: 'ai_task_retry_requested',
      payload: { taskId: task.id },
      visibility: 'system',
      idempotencyKey: `${task.id}:retry:${Date.now()}`,
    }],
  });
  return wakeTick(task.matchId);
}

async function cancelAiTask(taskId: string, reason: string = 'cancelled'): Promise<Match> {
  const task = await repo.cancelAiTask(taskId, reason);
  if (!task) throw new Error(`AI task not found: ${taskId}`);
  await repo.commitWorkflowChange({
    matchId: task.matchId,
    events: [{
      stepId: task.stepId,
      playerId: task.playerId,
      type: 'ai_task_cancelled',
      payload: { taskId: task.id, reason },
      visibility: 'system',
      idempotencyKey: `${task.id}:cancelled`,
    }],
  });
  return wakeTick(task.matchId);
}

async function manualCompleteAiTask(taskId: string, payload: Record<string, unknown> = {}): Promise<Match> {
  return completeAiTask(taskId, {
    eventType: 'ai_task_manual_completed',
    rawOutput: payload,
    payload: { ...payload, manual: true },
  });
}

async function submitPendingAction({ matchId, actionId, payload = {}, idempotencyKey = '' }: SubmitPendingActionInput): Promise<Match> {
  await getDbExecutor().withTransaction(async (transaction) => {
    const match = await repo.getMatch(matchId, transaction, true);
    if (!match) throw new Error(`Match not found: ${matchId}`);
    if (TERMINAL_STATUSES.includes(match.status)) {
      throw new Error(`Match cannot accept actions while status is ${match.status}`);
    }
    const action = await repo.getPendingAction(actionId, transaction);
    if (!action || action.matchId !== matchId) throw new Error(`Pending action not found: ${actionId}`);
    if (action.status === 'submitted') return;
    if (action.status !== 'pending') throw new Error(`Pending action cannot be submitted while status is ${action.status}`);
    const workflow = getWorkflow(match.workflowId);
    const currentStep = workflow.steps[Number(match.currentStepIndex || 0)];
    if (currentStep?.id !== action.stepId) throw new Error('Pending action does not belong to the current step');
    const eventKey = idempotencyKey || `${action.id}:submitted`;
    const { events } = await repo.commitWorkflowChange({
      matchId,
      events: [{
        stepId: action.stepId,
        playerId: action.playerId,
        type: 'pending_action_submitted',
        payload: {
          actionId: action.id,
          actorType: action.actorType,
          actionType: action.actionType,
          payload,
        },
        idempotencyKey: eventKey,
      }],
    }, transaction);
    const eventSeq = events[0]?.seq || null;
    await repo.submitPendingAction(action.id, { payload, resultEventSeq: eventSeq, idempotencyKey: action.idempotencyKey || eventKey }, transaction);
  });
  return wakeTick(matchId);
}

async function commitWorkflowChange(change: CommitChangeInput): Promise<CommitChangeResult> {
  return repo.commitWorkflowChange(change);
}

async function getDebugState(matchId: string) {
  return repo.getDebugState(matchId);
}

async function deleteWorkflowMatch(matchId: string): Promise<WorkflowMatchDeletionResult> {
  const match = await repo.getMatch(matchId);
  if (!match) throw new AppError(ErrorCodes.NOT_FOUND, 'Match 不存在', 404);
  if (!TERMINAL_STATUSES.includes(match.status)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '进行中的 Match 不可删除', 409);
  }

  const gamePlan = await prepareGameDeletion(matchId);
  let gameDeleted = false;
  let tracesDeleted = 0;
  let matchDeleted = false;
  await getDbExecutor().withTransaction(async (transaction) => {
    gameDeleted = await deleteGameRecords(matchId, transaction);
    tracesDeleted = await deleteTracesByGameId(matchId, transaction);
    matchDeleted = await deleteMatchCascade(matchId, transaction);
    if (!matchDeleted) throw new AppError(ErrorCodes.NOT_FOUND, 'Match 不存在', 404);
  });

  if (gamePlan && gameDeleted) cleanupGameFiles(gamePlan);
  return {
    matchId,
    deleted: {
      match: matchDeleted,
      game: gameDeleted,
      traces: tracesDeleted,
    },
  };
}

async function createInterrupt(input: {
  matchId: string;
  stepId?: string | null;
  effectId?: string | null;
  interruptType: string;
  priority?: number;
  payload?: Record<string, unknown>;
}) {
  return requestInterrupt(input);
}

async function resolveWorkflowInterrupt(interruptId: string, status: string, resolution: unknown = {}) {
  if ((await repo.getWorkflowInterrupt(interruptId))?.interruptType === UNDERCOVER_DEBUG_BREAKPOINT) {
    throw new Error('Undercover debug breakpoints require the dedicated Undercover debug control');
  }
  return resolveInterrupt(interruptId, status, resolution);
}

async function controlUndercoverDebugMatch({
  matchId,
  interruptId,
  action,
}: UndercoverDebugControlInput): Promise<Match> {
  if (!UNDERCOVER_DEBUG_ACTIONS.has(action)) {
    throw new Error(`Invalid Undercover debug action: ${String(action)}`);
  }
  if (!interruptId) {
    throw new Error('Undercover debug breakpoint interruptId is required');
  }
  await getDbExecutor().withTransaction(async (transaction) => {
    const match = await repo.getMatch(matchId, transaction, true);
    if (!match) throw new Error(`Undercover debug match not found: ${matchId}`);
    if (match.gameType !== 'undercover') throw new Error(`Match is not an Undercover match: ${matchId}`);
    if (match.config.debugMode !== true) throw new Error(`Undercover match is not a debug match: ${matchId}`);

    const workflow = getWorkflow(match.workflowId);
    const currentStep = workflow.steps[match.currentStepIndex];
    const interrupt = await repo.getWorkflowInterrupt(interruptId, transaction);
    if (!interrupt) {
      throw new Error(`Undercover debug breakpoint not found: ${interruptId}`);
    }
    if (interrupt.matchId !== matchId) {
      throw new Error(`Undercover debug breakpoint does not belong to match: ${matchId}`);
    }
    if (interrupt.interruptType !== UNDERCOVER_DEBUG_BREAKPOINT) {
      throw new Error(`Workflow interrupt is not an Undercover debug breakpoint: ${interruptId}`);
    }
    if (interrupt.status !== 'pending') {
      throw new Error(`Undercover debug breakpoint is not pending: ${interruptId}`);
    }
    if (!currentStep || interrupt.stepId !== currentStep.id) {
      throw new Error(`Undercover debug breakpoint does not belong to the current step: ${matchId}`);
    }
    if (action === 'skip' && currentStep.type !== 'undercover.speech') {
      throw new Error(`Undercover debug skip only supports speech steps: ${matchId}`);
    }
    if (action === 'continuous' && match.config.debugRunMode === 'continuous') {
      throw new Error(`Undercover debug match is already running continuously: ${matchId}`);
    }

    const status = action === 'skip' ? 'skipped' : 'resolved';
    const updated = await repo.updateWorkflowInterrupt(interrupt.id, {
      status,
      resolution_json: toJson({ action }),
    }, transaction);
    if (!updated) throw new Error(`Undercover debug breakpoint not found: ${interrupt.id}`);
    await repo.commitWorkflowChange({
      matchId,
      events: [{
        stepId: interrupt.stepId,
        type: 'workflow_interrupt_resolved',
        payload: updated,
        visibility: 'system',
        idempotencyKey: `${interrupt.id}:debug-control:${action}`,
      }],
      matchPatch: action === 'continuous'
        ? { config_json: toJson({ ...match.config, debugRunMode: 'continuous' }) }
        : null,
    }, transaction);
  });
  return wakeTick(matchId);
}

function listPendingOutbox(matchId: string) {
  return repo.listPendingOutbox(matchId);
}

function claimPendingOutbox(matchId: string) {
  return repo.claimPendingOutbox(matchId);
}

function listOutboxMessages(matchId: string, limit?: number) {
  return repo.listOutboxMessages(matchId, limit);
}

async function markOutboxSent(id: number): Promise<void> {
  return repo.markOutboxSent(id);
}

async function releaseOutboxClaim(id: number): Promise<void> {
  return repo.releaseOutboxClaim(id);
}

function initializeWorkflowMaintenance(): void {
  scheduleWorkflowMaintenance();
}

async function afterTick(match: Match): Promise<Match> {
  await maybeCleanupTerminalDebugMatch(match);
  return match;
}

async function maybeCleanupTerminalDebugMatch(match: Match | null): Promise<void> {
  if (!match?.config?.debugMode) return;
  if (!TERMINAL_STATUSES.includes(match.status)) return;
  await cleanupTerminalDebugMatches();
}

export {
  createWorkflowMatch,
  wakeTick,
  drainAiTasks,
  enqueueAiTask,
  claimNextAiTask,
  completeAiTask,
  failAiTask,
  retryAiTask,
  cancelAiTask,
  manualCompleteAiTask,
  submitPendingAction,
  commitWorkflowChange,
  createInterrupt,
  resolveWorkflowInterrupt,
  controlUndercoverDebugMatch,
  getDebugState,
  deleteWorkflowMatch,
  listPendingOutbox,
  claimPendingOutbox,
  listOutboxMessages,
  markOutboxSent,
  releaseOutboxClaim,
  initializeWorkflowMaintenance,
};
export type {
  UndercoverDebugAction,
  UndercoverDebugControlInput,
  WorkflowMatchDeletionResult,
};
