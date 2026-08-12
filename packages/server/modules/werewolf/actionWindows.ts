import * as repo from '../workflow-engine/repository';
import { stableTaskId } from '../workflow-engine/utils';
import { BLOCKER_TYPES, BLOCKER_STATUS, ACTION_WINDOW_STATUS } from '@ai-presenter/shared/types/workflowTypes';
import { hasRoleAction, sortBySeat } from './utils';
import type { DbExecutor } from '../../db/types';

interface Agent {
  id: number;
  alive?: boolean;
  actorType?: string;
  isHuman?: boolean;
  roleConfig?: Record<string, unknown>;
  [key: string]: unknown;
}

interface Match {
  id: string;
  [key: string]: unknown;
}

interface Step {
  id: string;
  config: {
    day?: number;
    phase?: string;
    actionType?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface ActionWindow {
  id: string;
  matchId: string;
  stepId: string;
  day?: number;
  phase?: string;
  actionType: string;
  epochActionType?: string;
  actorIds: number[];
  targetIds: number[];
  optional: boolean;
  visibility: string;
  [key: string]: unknown;
}

interface ActionResult {
  source: string;
  actorId: number;
  payload: Record<string, unknown>;
}

interface Runtime {
  agents: Agent[];
  [key: string]: unknown;
}

async function buildActionWindow({ match, step, state, actionType, epochActionType, actors, targetIds = [], optional = false, db }: {
  match: Match;
  step: Step;
  state: Record<string, unknown>;
  actionType: string;
  epochActionType?: string;
  actors: Agent[];
  targetIds?: number[];
  optional?: boolean;
  db?: DbExecutor;
}): Promise<ActionWindow> {
  const actorList: Agent[] = step.config.ordered ? (actors || []) : sortBySeat(actors || []);
  const epochKey = epochActionType || actionType;
  const epochId = `${match.id}:${step.id}:${epochKey}`;
  const window: ActionWindow = {
    id: epochId,
    matchId: match.id,
    stepId: step.id,
    day: step.config.day,
    phase: step.config.phase,
    actionType,
    epochActionType: epochKey,
    actorIds: actorList.map((actor: Agent) => actor.id),
    targetIds,
    optional,
    visibility: resolveVisibility(actionType),
    orderMode: step.config.ordered ? 'ordered' : 'parallel',
    completionPolicy: 'all'
  };
  await repo.upsertActionWindowEpoch({
    id: epochId,
    matchId: match.id,
    stepId: step.id,
    actionType: epochKey,
    status: ACTION_WINDOW_STATUS.OPEN,
    window: window as Record<string, unknown>
  }, db);
  return window;
}

async function createActionBlockers({ match, step, window, actors, promptContext = {}, taskActionType, db }: {
  match: Match;
  step: Step;
  window: ActionWindow;
  actors: Agent[];
  promptContext?: Record<string, unknown>;
  taskActionType?: string;
  db?: DbExecutor;
}) {
  const workActionType = taskActionType || window.actionType;
  const activeActors = await selectActorsForWindow(match.id, step.id, window, actors, workActionType, db);
  const blockers: Record<string, unknown>[] = [];
  const tasks: Record<string, unknown>[] = [];
  const pendingActions: Record<string, unknown>[] = [];
  for (const actor of activeActors || []) {
    const actorType = resolveActorType(actor);
    const taskKey = `${workActionType}:${actor.id}`;
    const id = stableTaskId(match.id, step.id, taskKey);
    if (actorType === 'human') {
      pendingActions.push({
        id,
        matchId: match.id,
        stepId: step.id,
        epochId: window.id,
        playerId: actor.id,
        actorType,
        actionType: workActionType,
        status: 'pending',
        payload: { window, promptContext },
        idempotencyKey: taskKey
      });
      blockers.push({
        id: `${step.id}:${window.actionType}:${actor.id}:human`,
        type: BLOCKER_TYPES.HUMAN_ACTION,
        required: true,
        status: BLOCKER_STATUS.PENDING,
        actionId: id
      });
      continue;
    }
    tasks.push({
      id,
      matchId: match.id,
      stepId: step.id,
      epochId: window.id,
      playerId: actor.id,
      taskKey,
      action: workActionType,
      status: 'queued',
      prompt: { window, actorId: actor.id },
      promptContextSnapshot: promptContext,
      visibleEventSeqMax: Math.max(0, ...(await repo.listEvents(match.id, db)).map((event: { seq?: number }) => event.seq || 0)),
      visibleEventIds: []
    });
    blockers.push({
      id: `${step.id}:${window.actionType}:${actor.id}:ai`,
      type: BLOCKER_TYPES.AI_TASK,
      required: true,
      status: BLOCKER_STATUS.PENDING,
      taskId: id
    });
  }
  return { blockers, tasks, pendingActions };
}

async function hasOpenWork(matchId: string, stepId: string, actionType: string, db?: DbExecutor): Promise<boolean> {
  const tasks = (await repo.listAiTasks(matchId, null, db)).filter((task: { stepId: string; action: string }) => task.stepId === stepId && task.action === actionType);
  const actions = (await repo.listPendingActions(matchId, db)).filter((action: { stepId: string; actionType: string }) => action.stepId === stepId && action.actionType === actionType);
  return tasks.length > 0 || actions.length > 0;
}

async function collectActionResults(matchId: string, stepId: string, actionType: string, db?: DbExecutor): Promise<ActionResult[]> {
  const taskResults = (await repo.listAiTasks(matchId, null, db))
    .filter((task: { stepId: string; action: string; status: string }) => task.stepId === stepId && task.action === actionType && task.status === 'succeeded')
    .map((task: { playerId: string | number; result?: { payload?: Record<string, unknown> } }) => ({
      source: 'ai',
      actorId: Number(task.playerId),
      payload: task.result?.payload || {}
    }));
  const actionResults = (await repo.listPendingActions(matchId, db))
    .filter((action: { stepId: string; actionType: string; status: string }) => action.stepId === stepId && action.actionType === actionType && action.status === 'submitted')
    .map((action: { playerId?: string | number; payload?: unknown }) => ({
      source: 'human',
      actorId: Number(action.playerId),
      payload: payloadRecord(action.payload)
    }));
  return [...taskResults, ...actionResults];
}

async function allActionWorkSucceeded(matchId: string, stepId: string, actionType: string, actorCount: number, db?: DbExecutor): Promise<boolean> {
  const completed = (await collectActionResults(matchId, stepId, actionType, db)).length;
  return completed >= actorCount;
}

async function resolveActionWindow(matchId: string, stepId: string, actionType: string, window?: ActionWindow | null, db?: DbExecutor): Promise<void> {
  const epochActionType = window?.epochActionType || actionType;
  await repo.upsertActionWindowEpoch({
    id: window?.id || `${matchId}:${stepId}:${epochActionType}`,
    matchId,
    stepId,
    actionType: epochActionType,
    status: ACTION_WINDOW_STATUS.RESOLVED,
    window: (window || {}) as Record<string, unknown>
  }, db);
}

async function selectActorsForWindow(matchId: string, stepId: string, window: ActionWindow, actors: Agent[], taskActionType: string = window.actionType, db?: DbExecutor): Promise<Agent[]> {
  if (window.orderMode !== 'ordered') return actors || [];
  const eligibleIds = new Set((actors || []).map((actor) => Number(actor.id)));
  const completed = (await collectActionResults(matchId, stepId, taskActionType, db))
    .filter((result) => eligibleIds.has(Number(result.actorId)))
    .length;
  const orderedActors = Array.isArray(window.actorIds) && window.actorIds.length
    ? window.actorIds
        .map((id) => (actors || []).find((actor) => Number(actor.id) === Number(id)))
        .filter((actor): actor is Agent => Boolean(actor))
    : (actors || []);
  const next = orderedActors[completed];
  return next ? [next] : [];
}

function payloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function getAliveActorsByAction(runtime: Runtime, action: string): Agent[] {
  return sortBySeat(runtime.agents.filter((agent: Agent) => agent.alive && hasRoleAction(agent.roleConfig, action)));
}

function resolveActorType(actor: Agent): string {
  return actor.actorType === 'human' || actor.isHuman ? 'human' : 'ai';
}

function resolveVisibility(actionType: string): string {
  if (actionType === 'day_speech' || actionType === 'day_vote' || actionType === 'mvp_vote' || actionType === 'postgame_speech') return 'public';
  if (actionType?.startsWith('sheriff_')) return 'public';
  return 'private';
}

export {
  buildActionWindow,
  createActionBlockers,
  hasOpenWork,
  collectActionResults,
  allActionWorkSucceeded,
  resolveActionWindow,
  getAliveActorsByAction
};

export type { ActionWindow, ActionResult, Agent, Match, Step, Runtime };
