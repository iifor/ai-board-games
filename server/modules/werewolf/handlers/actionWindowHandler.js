const {
  buildActionWindow,
  createActionBlockers,
  hasOpenWork,
  collectActionResults,
  allActionWorkSucceeded,
  resolveActionWindow
} = require('../actionWindows');
const { createRuntime, ensureRound, syncRuntimeState } = require('../runtime');
const { applyActionResults, getActorsForStep, getTargetIds } = require('../reducers');
const { runActionWindowAiTask, validateActionWindowAiResult } = require('../aiActions');
const { createWerewolfEvent, completed, isDone, markStepComplete } = require('./common');

function createActionWindowHandler() {
  return {
    execute({ match, step, state }) {
      if (isDone(state, step.id) || state.winner) return completed(state, step.id);
      const runtime = createRuntime(match, state);
      const round = ensureRound(runtime.state, step.config.day);
      const actors = getActorsForStep(runtime, step, round);
      if (!actors.length) return skipAction(match, step, runtime);

      if (!hasOpenWork(match.id, step.id, step.config.actionType)) {
        return openActionWindow({ match, step, state, runtime, round, actors });
      }

      if (!allActionWorkSucceeded(match.id, step.id, step.config.actionType, actors.length)) {
        return waitForActionWindow({ match, step, state, round, actors });
      }

      applyActionResults(runtime, step, collectActionResults(match.id, step.id, step.config.actionType));
      const nextState = markStepComplete({ ...syncRuntimeState(runtime), currentStep: step.id, currentActionWindow: null }, step.id);
      resolveActionWindow(match.id, step.id, step.config.actionType, state.currentActionWindow);
      return {
        status: 'COMPLETED',
        state: nextState,
        events: [createWerewolfEvent(match, step, nextState, 'werewolf_action_submitted', `${step.config.actionType} resolved`)]
      };
    },
    runAiTask: runActionWindowAiTask,
    validateAiResult: validateActionWindowAiResult
  };
}

function skipAction(match, step, runtime) {
  const nextState = markStepComplete({ ...syncRuntimeState(runtime), currentStep: step.id }, step.id);
  return {
    status: 'COMPLETED',
    state: nextState,
    events: [createWerewolfEvent(match, step, nextState, 'werewolf_action_skipped', `${step.config.actionType} skipped`)]
  };
}

function openActionWindow({ match, step, state, runtime, round, actors }) {
  const window = buildActionWindow({
    match,
    step,
    state,
    actionType: step.config.actionType,
    actors,
    targetIds: getTargetIds(runtime, step),
    optional: Boolean(step.config.optional)
  });
  const work = createActionBlockers({
    match,
    step,
    window,
    actors,
    promptContext: { day: step.config.day, actionType: step.config.actionType, round }
  });
  return {
    status: 'WAITING',
    state: { ...state, currentStep: step.id, currentActionWindow: window },
    blockers: work.blockers,
    tasks: work.tasks,
    pendingActions: work.pendingActions,
    events: [createWerewolfEvent(match, step, state, 'werewolf_action_requested', `${step.config.actionType} requested`, { actionWindow: window })]
  };
}

function waitForActionWindow({ match, step, state, round, actors }) {
  const existingWindow = state.currentActionWindow || { id: `${match.id}:${step.id}:${step.config.actionType}` };
  const work = createActionBlockers({
    match,
    step,
    window: existingWindow,
    actors,
    promptContext: { day: step.config.day, actionType: step.config.actionType, round }
  });
  return {
    status: 'WAITING',
    state: { ...state, currentStep: step.id },
    blockers: work.blockers
  };
}

module.exports = { createActionWindowHandler };
