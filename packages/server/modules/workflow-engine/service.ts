import * as repo from './repository';
import type { CommitChangeInput, CommitChangeResult } from './repository';
import { requestInterrupt, resolveInterrupt } from './effects';
import { getDb } from '../../db';
import { tickMatch } from './tick';
import { processClaimedAiTask } from './aiTaskWorker';
import { getWorkflow } from './workflowRegistry';
import { createId, nowIso, toJson } from './utils';
import { MATCH_STATUS } from '@ai-presenter/shared/types/workflowTypes';
import type { Match, AiTask } from '../../types/workflow';

const MAX_AI_ATTEMPTS = 2;

const TERMINAL_STATUSES: string[] = [MATCH_STATUS.COMPLETED, MATCH_STATUS.FAILED, MATCH_STATUS.PAUSED_DEBUG];

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

function createWorkflowMatch({ workflowId, gameType, config, initialState, matchId }: CreateMatchInput): Match {
  const workflow = getWorkflow(workflowId);
  const id = matchId || createId(gameType || workflow.gameType || 'match');
  repo.createMatch({
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
  repo.commitWorkflowChange({
    matchId: id,
    events: [{
      type: 'match_created',
      payload: { workflowId, gameType: gameType || workflow.gameType },
      idempotencyKey: `${id}:created`,
    }],
  });
  return tickMatch(id);
}

function wakeTick(matchId: string): Match {
  return tickMatch(matchId);
}

async function drainAiTasks(matchId: string, options: DrainOptions = {}): Promise<{ processed: number; match: Match | null }> {
  const maxTasks = Number(options.maxTasks || 100);
  const workerId = options.workerId || 'inline-worker';
  let processed = 0;
  while (processed < maxTasks) {
    const task = claimNextAiTask({ matchId, workerId });
    if (!task) break;
    await processClaimedAiTask(task.id);
    processed += 1;
    const match = repo.getMatch(matchId);
    if (!match || TERMINAL_STATUSES.includes(match.status)) break;
  }
  return { processed, match: repo.getMatch(matchId) };
}

function enqueueAiTask(task: Record<string, unknown>): AiTask | null {
  repo.createAiTask(task as never);
  return repo.getAiTask(task.id as string);
}

function claimNextAiTask({ matchId = null, workerId = 'worker' }: { matchId?: string | null; workerId?: string } = {}): AiTask | null {
  return repo.claimNextAiTask({ matchId, workerId });
}

function completeAiTask(taskId: string, result: AiTaskResult | Record<string, unknown>): Match {
  const task = repo.getAiTask(taskId);
  if (!task) throw new Error(`AI task not found: ${taskId}`);
  if (task.status === 'succeeded') return repo.getMatch(task.matchId) as Match;
  if (task.status === 'cancelled') throw new Error('AI task was cancelled');
  const payload = (result as AiTaskResult).payload || result;
  if (!payload || (typeof payload === 'object' && !Object.keys(payload as object).length)) {
    return failAiTask(taskId, { message: 'AI task result payload is empty', severity: 'high' }) as Match;
  }
  repo.updateAiTask(task.id, {
    status: 'succeeded',
    raw_output: typeof (result as AiTaskResult).rawOutput === 'string'
      ? (result as AiTaskResult).rawOutput
      : JSON.stringify((result as AiTaskResult).rawOutput ?? payload),
    result_json: toJson(result),
  });
  repo.commitWorkflowChange({
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
  return wakeTick(task.matchId);
}

function failAiTask(taskId: string, error: AiTaskError = {}): Match | AiTask {
  const task = repo.getAiTask(taskId);
  if (!task) throw new Error(`AI task not found: ${taskId}`);
  const message = error.message || String(error || 'AI task failed');
  const severity = error.severity || 'medium';
  const shouldPause = severity === 'critical' || severity === 'high' || Number(task.attempts || 0) >= MAX_AI_ATTEMPTS;
  repo.updateAiTask(task.id, {
    status: shouldPause ? 'failed' : 'retrying',
    error_json: toJson({ message, severity }),
  });
  repo.commitWorkflowChange({
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
  return shouldPause ? repo.getMatch(task.matchId)! : repo.getAiTask(task.id) as AiTask;
}

function retryAiTask(taskId: string): Match {
  const task = repo.retryAiTask(taskId);
  if (!task) throw new Error(`AI task not found: ${taskId}`);
  const match = repo.getMatch(task.matchId);
  if (match?.status === MATCH_STATUS.PAUSED_DEBUG) {
    repo.updateMatch(task.matchId, { status: MATCH_STATUS.WAITING, error_json: 'null' });
  }
  repo.commitWorkflowChange({
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

function cancelAiTask(taskId: string, reason: string = 'cancelled'): Match {
  const task = repo.cancelAiTask(taskId, reason);
  if (!task) throw new Error(`AI task not found: ${taskId}`);
  repo.commitWorkflowChange({
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

function manualCompleteAiTask(taskId: string, payload: Record<string, unknown> = {}): Match {
  return completeAiTask(taskId, {
    eventType: 'ai_task_manual_completed',
    rawOutput: payload,
    payload: { ...payload, manual: true },
  });
}

function submitPendingAction({ matchId, actionId, payload = {}, idempotencyKey = '' }: SubmitPendingActionInput): Match {
  getDb().transaction(() => {
    const match = repo.getMatch(matchId);
    if (!match) throw new Error(`Match not found: ${matchId}`);
    if (TERMINAL_STATUSES.includes(match.status)) {
      throw new Error(`Match cannot accept actions while status is ${match.status}`);
    }
    const action = repo.getPendingAction(actionId);
    if (!action || action.matchId !== matchId) throw new Error(`Pending action not found: ${actionId}`);
    if (action.status === 'submitted') return;
    if (action.status !== 'pending') throw new Error(`Pending action cannot be submitted while status is ${action.status}`);
    const workflow = getWorkflow(match.workflowId);
    const currentStep = workflow.steps[Number(match.currentStepIndex || 0)];
    if (currentStep?.id !== action.stepId) throw new Error('Pending action does not belong to the current step');
    const eventKey = idempotencyKey || `${action.id}:submitted`;
    const { events } = repo.commitWorkflowChange({
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
    });
    const eventSeq = events[0]?.seq || null;
    repo.submitPendingAction(action.id, { payload, resultEventSeq: eventSeq, idempotencyKey: action.idempotencyKey || eventKey });
  })();
  return wakeTick(matchId);
}

function commitWorkflowChange(change: CommitChangeInput): CommitChangeResult {
  return repo.commitWorkflowChange(change);
}

function getDebugState(matchId: string) {
  return repo.getDebugState(matchId);
}

function createInterrupt(input: {
  matchId: string;
  stepId?: string | null;
  effectId?: string | null;
  interruptType: string;
  priority?: number;
  payload?: Record<string, unknown>;
}) {
  return requestInterrupt(input);
}

function resolveWorkflowInterrupt(interruptId: string, status: string, resolution: unknown = {}) {
  return resolveInterrupt(interruptId, status, resolution);
}

function listPendingOutbox(matchId: string) {
  return repo.listPendingOutbox(matchId);
}

function listOutboxMessages(matchId: string, limit?: number) {
  return repo.listOutboxMessages(matchId, limit);
}

function markOutboxSent(id: number): void {
  return repo.markOutboxSent(id);
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
  getDebugState,
  listPendingOutbox,
  listOutboxMessages,
  markOutboxSent,
};
