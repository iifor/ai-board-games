const {
  buildActionWindow,
  createActionBlockers,
  hasOpenWork,
  collectActionResults,
  allActionWorkSucceeded,
  resolveActionWindow
} = require('../actionWindows');
const { resolveNightEffects, resolveExileEffects, applyHunterShot } = require('../effects');
const { createRuntime, ensureRound, syncRuntimeState } = require('../runtime');
const { findPendingHunter } = require('../reducers');
const { runHunterAiTask, validateHunterAiResult } = require('../aiActions');
const { createWerewolfEvent, completed, isDone, markStepComplete } = require('./common');

function createNightResolveHandler() {
  return {
    execute({ match, step, state }) {
      if (isDone(state, step.id) || state.winner) return completed(state, step.id);
      const runtime = createRuntime(match, state);
      const round = ensureRound(runtime.state, step.config.day);
      const resolved = resolveNightEffects(runtime.agents, round);
      const hunter = findPendingHunter(runtime.agents, round, resolved.deaths);
      if (hunter) return createHunterWindow({ match, step, state, runtime, round, hunter });
      const nextState = markStepComplete({ ...syncRuntimeState(runtime), currentStep: step.id }, step.id);
      return {
        status: 'COMPLETED',
        state: nextState,
        events: [createWerewolfEvent(match, step, nextState, 'werewolf_effect_resolved', 'night resolved', { effects: resolved.effects })]
      };
    },
    runAiTask: runHunterAiTask,
    validateAiResult: validateHunterAiResult
  };
}

function createExileResolveHandler() {
  return {
    execute({ match, step, state }) {
      if (isDone(state, step.id) || state.winner) return completed(state, step.id);
      const runtime = createRuntime(match, state);
      const round = ensureRound(runtime.state, step.config.day);
      const resolved = resolveExileEffects(runtime.agents, round, runtime.modeConfig);
      const hunter = findPendingHunter(runtime.agents, round, resolved.exile ? [resolved.exile] : []);
      if (hunter) return createHunterWindow({ match, step, state, runtime, round, hunter });
      const nextState = markStepComplete({ ...syncRuntimeState(runtime), currentStep: step.id }, step.id);
      return {
        status: 'COMPLETED',
        state: nextState,
        events: [createWerewolfEvent(match, step, nextState, 'werewolf_effect_resolved', 'exile resolved', { effects: resolved.effects })]
      };
    },
    runAiTask: runHunterAiTask,
    validateAiResult: validateHunterAiResult
  };
}

function createHunterWindow({ match, step, state, runtime, round, hunter }) {
  const actionType = 'hunter_shot';
  if (!hasOpenWork(match.id, step.id, actionType)) {
    const window = buildActionWindow({
      match,
      step: { ...step, config: { ...step.config, actionType } },
      state,
      actionType,
      actors: [hunter],
      targetIds: runtime.agents.filter((agent) => agent.alive).map((agent) => agent.id),
      optional: false
    });
    const work = createActionBlockers({ match, step, window, actors: [hunter], promptContext: { day: round.day, actionType, round } });
    return {
      status: 'WAITING',
      state: { ...state, currentStep: step.id, currentActionWindow: window },
      blockers: work.blockers,
      tasks: work.tasks,
      pendingActions: work.pendingActions,
      events: [createWerewolfEvent(match, step, state, 'werewolf_action_requested', 'hunter shot requested', { actionWindow: window })]
    };
  }
  if (!allActionWorkSucceeded(match.id, step.id, actionType, 1)) {
    const window = state.currentActionWindow || { id: `${match.id}:${step.id}:${actionType}` };
    const work = createActionBlockers({ match, step, window, actors: [hunter], promptContext: { day: round.day, actionType, round } });
    return { status: 'WAITING', state: { ...state, currentStep: step.id }, blockers: work.blockers };
  }
  const result = collectActionResults(match.id, step.id, actionType)[0];
  const effect = applyHunterShot(runtime.agents, round, { from: hunter.id, target: result?.payload?.target, reason: round.phase });
  const nextState = markStepComplete({ ...syncRuntimeState(runtime), currentStep: step.id, currentActionWindow: null }, step.id);
  resolveActionWindow(match.id, step.id, actionType, state.currentActionWindow);
  return {
    status: 'COMPLETED',
    state: nextState,
    events: [createWerewolfEvent(match, step, nextState, 'werewolf_effect_resolved', 'hunter shot resolved', { effects: effect ? [effect] : [] })]
  };
}

module.exports = {
  createNightResolveHandler,
  createExileResolveHandler,
  createHunterWindow
};
