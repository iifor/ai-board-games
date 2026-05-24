const { MATCH_STATUS } = require('../../../../shared/types/workflowTypes');
const { checkWin } = require('../winCheck');
const { createRuntime, syncRuntimeState } = require('../runtime');
const { createWerewolfEvent, completed, isDone, markStepComplete } = require('./common');

function createCheckWinHandler() {
  return {
    execute({ match, step, state }) {
      if (isDone(state, step.id)) return completed(state, step.id);
      if (state.winner) return { status: 'COMPLETED', state: markStepComplete({ ...state, currentStep: step.id }, step.id) };
      const runtime = createRuntime(match, state);
      const result = checkWin(runtime.agents, step.config.day || 1, runtime.modeConfig, {});
      const nextState = markStepComplete({
        ...syncRuntimeState(runtime),
        currentStep: step.id,
        winner: result.winner,
        winReason: result.winReason || ''
      }, step.id);
      return {
        status: 'COMPLETED',
        matchStatus: result.winner ? MATCH_STATUS.COMPLETED : undefined,
        state: nextState,
        events: [createWerewolfEvent(match, step, nextState, result.winner ? 'werewolf_game_completed' : 'werewolf_phase_changed', result.winner ? 'winner decided' : 'game continues')]
      };
    }
  };
}

function createFinalizeHandler() {
  return {
    execute({ match, step, state }) {
      if (isDone(state, step.id)) return completed(state, step.id);
      const aliveWolves = (state.players || []).filter((agent) => agent.alive && agent.faction === 'wolves').length;
      const nextState = markStepComplete({
        ...state,
        currentStep: step.id,
        winner: state.winner || (aliveWolves ? 'wolves' : 'good'),
        winReason: state.winReason || 'max days reached'
      }, step.id);
      return {
        status: 'COMPLETED',
        matchStatus: MATCH_STATUS.COMPLETED,
        state: nextState,
        events: [createWerewolfEvent(match, step, nextState, 'werewolf_game_completed', 'game completed')]
      };
    }
  };
}

module.exports = {
  createCheckWinHandler,
  createFinalizeHandler
};
