const repo = require('../workflow-engine/repository');
const { stableTaskId } = require('../workflow-engine/utils');
const { BLOCKER_TYPES, BLOCKER_STATUS, ACTION_WINDOW_STATUS } = require('@consensus-mist/shared/types/workflowTypes');
const { hasRoleAction, sortBySeat } = require('./utils');

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
  actorIds: number[];
  targetIds: number[];
  optional: boolean;
  visibility: string;
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

function buildActionWindow({ match, step, state, actionType, actors, targetIds = [], optional = false }: {
  match: Match;
  step: Step;
  state: Record<string, unknown>;
  actionType: string;
  actors: Agent[];
  targetIds?: number[];
  optional?: boolean;
}): ActionWindow {
  const actorList: Agent[] = sortBySeat(actors || []);
  const epochId = `${match.id}:${step.id}:${actionType}`;
  const window: ActionWindow = {
    id: epochId,
    matchId: match.id,
    stepId: step.id,
    day: step.config.day,
    phase: step.config.phase,
    actionType,
    actorIds: actorList.map((actor: Agent) => actor.id),
    targetIds,
    optional,
    visibility: actionType === 'day_speech' || actionType === 'day_vote' ? 'public' : 'private'
  };
  repo.upsertActionWindowEpoch({
    id: epochId,
    matchId: match.id,
    stepId: step.id,
    actionType,
    status: ACTION_WINDOW_STATUS.OPEN,
    window
  });
  return window;
}

function createActionBlockers({ match, step, window, actors, promptContext = {} }: {
  match: Match;
  step: Step;
  window: ActionWindow;
  actors: Agent[];
  promptContext?: Record<string, unknown>;
}) {
  const blockers: Record<string, unknown>[] = [];
  const tasks: Record<string, unknown>[] = [];
  const pendingActions: Record<string, unknown>[] = [];
  for (const actor of actors || []) {
    const actorType = resolveActorType(actor);
    const taskKey = `${window.actionType}:${actor.id}`;
    const id = stableTaskId(match.id, step.id, taskKey);
    if (actorType === 'human') {
      pendingActions.push({
        id,
        matchId: match.id,
        stepId: step.id,
        epochId: window.id,
        playerId: actor.id,
        actorType,
        actionType: window.actionType,
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
      action: window.actionType,
      status: 'queued',
      prompt: { window, actorId: actor.id },
      promptContextSnapshot: promptContext,
      visibleEventSeqMax: Math.max(0, ...repo.listEvents(match.id).map((event: { seq?: number }) => event.seq || 0)),
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

function hasOpenWork(matchId: string, stepId: string, actionType: string): boolean {
  const tasks = repo.listAiTasks(matchId).filter((task: { stepId: string; action: string }) => task.stepId === stepId && task.action === actionType);
  const actions = repo.listPendingActions(matchId).filter((action: { stepId: string; actionType: string }) => action.stepId === stepId && action.actionType === actionType);
  return tasks.length > 0 || actions.length > 0;
}

function collectActionResults(matchId: string, stepId: string, actionType: string): ActionResult[] {
  const taskResults = repo.listAiTasks(matchId)
    .filter((task: { stepId: string; action: string; status: string }) => task.stepId === stepId && task.action === actionType && task.status === 'succeeded')
    .map((task: { playerId: string | number; result?: { payload?: Record<string, unknown> } }) => ({
      source: 'ai',
      actorId: Number(task.playerId),
      payload: task.result?.payload || {}
    }));
  const actionResults = repo.listPendingActions(matchId)
    .filter((action: { stepId: string; actionType: string; status: string }) => action.stepId === stepId && action.actionType === actionType && action.status === 'submitted')
    .map((action: { playerId: string | number; payload?: Record<string, unknown> }) => ({
      source: 'human',
      actorId: Number(action.playerId),
      payload: action.payload || {}
    }));
  return [...taskResults, ...actionResults];
}

function allActionWorkSucceeded(matchId: string, stepId: string, actionType: string, actorCount: number): boolean {
  const completed = collectActionResults(matchId, stepId, actionType).length;
  return completed >= actorCount;
}

function resolveActionWindow(matchId: string, stepId: string, actionType: string, window?: ActionWindow | null): void {
  repo.upsertActionWindowEpoch({
    id: window?.id || `${matchId}:${stepId}:${actionType}`,
    matchId,
    stepId,
    actionType,
    status: ACTION_WINDOW_STATUS.RESOLVED,
    window: window || {}
  });
}

function getAliveActorsByAction(runtime: Runtime, action: string): Agent[] {
  return sortBySeat(runtime.agents.filter((agent: Agent) => agent.alive && hasRoleAction(agent.roleConfig, action)));
}

function resolveActorType(actor: Agent): string {
  return actor.actorType === 'human' || actor.isHuman ? 'human' : 'ai';
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

export type { ActionWindow };
