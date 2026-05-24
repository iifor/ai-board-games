const repo = require('../workflow-engine/repository');
const { stableTaskId } = require('../workflow-engine/utils');
const { BLOCKER_TYPES, BLOCKER_STATUS, ACTION_WINDOW_STATUS } = require('../../../shared/types/workflowTypes');
const { hasRoleAction, sortBySeat } = require('./utils');

function buildActionWindow({ match, step, state, actionType, actors, targetIds = [], optional = false }) {
  const actorList = sortBySeat(actors || []);
  const epochId = `${match.id}:${step.id}:${actionType}`;
  const window = {
    id: epochId,
    matchId: match.id,
    stepId: step.id,
    day: step.config.day,
    phase: step.config.phase,
    actionType,
    actorIds: actorList.map((actor) => actor.id),
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

function createActionBlockers({ match, step, window, actors, promptContext = {} }) {
  const blockers = [];
  const tasks = [];
  const pendingActions = [];
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
      visibleEventSeqMax: Math.max(0, ...repo.listEvents(match.id).map((event) => event.seq || 0)),
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

function hasOpenWork(matchId, stepId, actionType) {
  const tasks = repo.listAiTasks(matchId).filter((task) => task.stepId === stepId && task.action === actionType);
  const actions = repo.listPendingActions(matchId).filter((action) => action.stepId === stepId && action.actionType === actionType);
  return tasks.length > 0 || actions.length > 0;
}

function collectActionResults(matchId, stepId, actionType) {
  const taskResults = repo.listAiTasks(matchId)
    .filter((task) => task.stepId === stepId && task.action === actionType && task.status === 'succeeded')
    .map((task) => ({
      source: 'ai',
      actorId: Number(task.playerId),
      payload: task.result?.payload || {}
    }));
  const actionResults = repo.listPendingActions(matchId)
    .filter((action) => action.stepId === stepId && action.actionType === actionType && action.status === 'submitted')
    .map((action) => ({
      source: 'human',
      actorId: Number(action.playerId),
      payload: action.payload || {}
    }));
  return [...taskResults, ...actionResults];
}

function allActionWorkSucceeded(matchId, stepId, actionType, actorCount) {
  const completed = collectActionResults(matchId, stepId, actionType).length;
  return completed >= actorCount;
}

function resolveActionWindow(matchId, stepId, actionType, window) {
  repo.upsertActionWindowEpoch({
    id: window?.id || `${matchId}:${stepId}:${actionType}`,
    matchId,
    stepId,
    actionType,
    status: ACTION_WINDOW_STATUS.RESOLVED,
    window: window || {}
  });
}

function getAliveActorsByAction(runtime, action) {
  return sortBySeat(runtime.agents.filter((agent) => agent.alive && hasRoleAction(agent.roleConfig, action)));
}

function resolveActorType(actor) {
  return actor.actorType === 'human' || actor.isHuman ? 'human' : 'ai';
}

module.exports = {
  buildActionWindow,
  createActionBlockers,
  hasOpenWork,
  collectActionResults,
  allActionWorkSucceeded,
  resolveActionWindow,
  getAliveActorsByAction
};
