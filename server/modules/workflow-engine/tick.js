const { getDb } = require('../../db');
const repo = require('./repository');
const { getWorkflow, getStepHandler } = require('./workflowRegistry');
const { evaluateCondition } = require('./condition');
const { MATCH_STATUS, BLOCKER_TYPES, BLOCKER_STATUS } = require('../../../shared/types/workflowTypes');
const { toJson } = require('./utils');

const DEFAULT_BUDGET = {
  maxSteps: 20,
  maxDurationMs: 300,
  maxEventsApplied: 100,
  maxInterruptsProcessed: 0
};

function tickMatch(matchId, budget = {}) {
  const limits = { ...DEFAULT_BUDGET, ...budget };
  const started = Date.now();
  return getDb().transaction(() => {
    let match = repo.getMatch(matchId);
    if (!match) throw new Error(`Match not found: ${matchId}`);
    if ([MATCH_STATUS.COMPLETED, MATCH_STATUS.FAILED, MATCH_STATUS.PAUSED_DEBUG].includes(match.status)) return match;

    const workflow = getWorkflow(match.workflowId);
    let stepsProcessed = 0;
    let state = match.state || {};
    let blockers = [];
    let status = MATCH_STATUS.RUNNING;
    let currentStepIndex = Number(match.currentStepIndex || 0);

    while (stepsProcessed < limits.maxSteps && Date.now() - started <= limits.maxDurationMs) {
      const step = workflow.steps[currentStepIndex];
      if (!step) {
        status = MATCH_STATUS.COMPLETED;
        repo.commitWorkflowChange({
          matchId,
          events: [{
            type: 'match_completed',
            payload: { state },
            idempotencyKey: `${matchId}:match_completed`
          }]
        });
        break;
      }

      const conditionContext = {
        config: match.config,
        publicState: state.publicState || state,
        stepState: state.stepState || {},
        round: state.round || null,
        phaseId: step.id,
        stepId: step.id
      };
      if (step.condition && !evaluateCondition(step.condition, conditionContext)) {
        repo.commitWorkflowChange({
          matchId,
          events: [{
            type: 'step_skipped',
            stepId: step.id,
            payload: { step },
            idempotencyKey: `${matchId}:${step.id}:skipped`
          }]
        });
        currentStepIndex += 1;
        stepsProcessed += 1;
        continue;
      }

      const handler = getStepHandler(match.workflowId, step.type);
      const result = handler.execute({ match, workflow, step, state });
      if (result.status === 'FAILED') {
        status = MATCH_STATUS.FAILED;
        repo.updateMatch(matchId, {
          status,
          error_json: toJson(result.error || { message: 'Step failed' }),
          state_json: toJson(state),
          blockers_json: toJson([])
        });
        return repo.getMatch(matchId);
      }

      state = result.state || state;
      if (result.events?.length) repo.commitWorkflowChange({
        matchId,
        events: result.events.map((event) => ({ stepId: step.id, ...event }))
      });
      if (result.tasks?.length) {
        for (const task of result.tasks) repo.createAiTask(task);
      }
      if (result.pendingActions?.length) {
        for (const action of result.pendingActions) repo.createPendingAction(action);
      }

      if (result.status === 'WAITING') {
        blockers = resolveBlockers(matchId, result.blockers || []);
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

      currentStepIndex += 1;
      stepsProcessed += 1;
    }

    const version = Number(match.version || 0) + 1;
    const { match: updated } = repo.commitWorkflowChange({
      matchId,
      matchPatch: {
        status,
        current_step_index: currentStepIndex,
        version,
        state_json: toJson(state),
        blockers_json: toJson(blockers),
        completed_at: status === MATCH_STATUS.COMPLETED ? new Date().toISOString() : match.completedAt || null
      },
      snapshot: true
    });
    return updated;
  })();
}

function resolveBlockers(matchId, blockers) {
  const tasks = new Map(repo.listAiTasks(matchId).map((task) => [task.id, task]));
  const actions = new Map(repo.listPendingActions(matchId).map((action) => [action.id, action]));
  return blockers.map((blocker) => {
    if (blocker.type === BLOCKER_TYPES.AI_TASK && blocker.taskId) {
      const task = tasks.get(blocker.taskId);
      if (task?.status === 'succeeded') return { ...blocker, status: BLOCKER_STATUS.COMPLETED };
      if (task?.status === 'failed') return { ...blocker, status: BLOCKER_STATUS.FAILED };
      if (task?.status === 'cancelled') return { ...blocker, status: BLOCKER_STATUS.CANCELLED };
    }
    if (blocker.type === BLOCKER_TYPES.HUMAN_ACTION && blocker.actionId) {
      const action = actions.get(blocker.actionId);
      if (action?.status === 'submitted') return { ...blocker, status: BLOCKER_STATUS.COMPLETED };
      if (action?.status === 'expired') return { ...blocker, status: BLOCKER_STATUS.EXPIRED };
      if (action?.status === 'cancelled') return { ...blocker, status: BLOCKER_STATUS.CANCELLED };
      if (action?.status === 'failed') return { ...blocker, status: BLOCKER_STATUS.FAILED };
    }
    return { ...blocker, status: blocker.status || BLOCKER_STATUS.PENDING };
  });
}

module.exports = { tickMatch, resolveBlockers };
