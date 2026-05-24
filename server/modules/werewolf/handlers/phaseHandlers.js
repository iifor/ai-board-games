const { createRuntime, ensureRound, syncRuntimeState } = require('../runtime');
const { createWerewolfEvent, completed, isDone, markStepComplete } = require('./common');

function createNightStartHandler() {
  return {
    execute({ match, step, state }) {
      if (isDone(state, step.id) || state.winner) return completed(state, step.id);
      const runtime = createRuntime(match, state);
      const round = ensureRound(runtime.state, step.config.day);
      round.phase = 'night';
      const nextState = syncRuntimeState(runtime);
      return {
        status: 'COMPLETED',
        state: markStepComplete({ ...nextState, currentStep: step.id }, step.id),
        events: [createWerewolfEvent(match, step, nextState, 'werewolf_phase_changed', `Night ${step.config.day} started`)]
      };
    }
  };
}

function createDayStartHandler() {
  return {
    execute({ match, step, state }) {
      if (isDone(state, step.id) || state.winner) return completed(state, step.id);
      const runtime = createRuntime(match, state);
      const round = ensureRound(runtime.state, step.config.day);
      round.phase = 'day';
      const nextState = syncRuntimeState(runtime);
      return {
        status: 'COMPLETED',
        state: markStepComplete({ ...nextState, currentStep: step.id }, step.id),
        events: [createWerewolfEvent(match, step, nextState, 'werewolf_phase_changed', `Day ${step.config.day} started`)]
      };
    }
  };
}

function createInstantHandler(eventType, message) {
  return {
    execute({ match, step, state }) {
      if (isDone(state, step.id)) return completed(state, step.id);
      const nextState = markStepComplete({ ...state, currentStep: step.id }, step.id);
      return { status: 'COMPLETED', state: nextState, events: [createWerewolfEvent(match, step, nextState, eventType, message)] };
    }
  };
}

module.exports = {
  createNightStartHandler,
  createDayStartHandler,
  createInstantHandler
};
