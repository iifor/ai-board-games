const { getDb } = require('../../db');
const repo = require('./repository');
const { getWorkflow, getStepHandler } = require('./workflowRegistry');
const { evaluateCondition } = require('./condition');
const { MATCH_STATUS } = require('../../../shared/types/workflowTypes');
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
        const eventRow = repo.appendEvent({
          matchId,
          type: 'match_completed',
          payload: { state },
          idempotencyKey: `${matchId}:match_completed`
        });
        repo.insertOutbox(matchId, eventRow);
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
        const eventRow = repo.appendEvent({
          matchId,
          type: 'step_skipped',
          stepId: step.id,
          payload: { step },
          idempotencyKey: `${matchId}:${step.id}:skipped`
        });
        repo.insertOutbox(matchId, eventRow);
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
      if (result.events?.length) {
        for (const event of result.events) {
          const eventRow = repo.appendEvent({ matchId, stepId: step.id, ...event });
          repo.insertOutbox(matchId, eventRow);
        }
      }
      if (result.tasks?.length) {
        for (const task of result.tasks) repo.createAiTask(task);
      }
      if (result.pendingActions?.length) {
        for (const action of result.pendingActions) repo.createPendingAction(action);
      }

      if (result.status === 'WAITING') {
        blockers = result.blockers || [];
        status = MATCH_STATUS.WAITING;
        break;
      }

      currentStepIndex += 1;
      stepsProcessed += 1;
    }

    const version = Number(match.version || 0) + 1;
    repo.updateMatch(matchId, {
      status,
      current_step_index: currentStepIndex,
      version,
      state_json: toJson(state),
      blockers_json: toJson(blockers),
      completed_at: status === MATCH_STATUS.COMPLETED ? new Date().toISOString() : match.completedAt || null
    });
    const updated = repo.getMatch(matchId);
    repo.upsertSnapshot(updated);
    return updated;
  })();
}

module.exports = { tickMatch };
