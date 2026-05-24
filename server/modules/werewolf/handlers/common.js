const { serializeWerewolfState } = require('../runtime');

function createWerewolfEvent(match, step, state, workflowEvent, message, extra = {}) {
  return {
    type: workflowEvent,
    payload: {
      stepId: step.id,
      workflowEvent,
      message,
      game: serializeWerewolfState(match, state),
      ...extra
    },
    idempotencyKey: `${match.id}:${step.id}:${workflowEvent}`
  };
}

function completed(state, stepId) {
  return { status: 'COMPLETED', state: markStepComplete(state, stepId) };
}

function isDone(state, stepId) {
  return Boolean(state.completedSteps?.[stepId]);
}

function markStepComplete(state, stepId) {
  return {
    ...state,
    completedSteps: { ...(state.completedSteps || {}), [stepId]: true }
  };
}

module.exports = {
  createWerewolfEvent,
  completed,
  isDone,
  markStepComplete
};
