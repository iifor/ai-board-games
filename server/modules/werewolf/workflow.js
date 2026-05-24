const workflowService = require('../workflow-engine/service');
const { registerWorkflow } = require('../workflow-engine/workflowRegistry');
const { createWerewolfSteps } = require('./steps');
const { createWerewolfHandlers } = require('./handlers');
const { createInitialWerewolfState, serializeWerewolfState } = require('./runtime');

const WEREWOLF_WORKFLOW_ID = 'werewolf.workflow.basic.v1';

const werewolfWorkflow = {
  id: WEREWOLF_WORKFLOW_ID,
  gameType: 'werewolf',
  version: 'basic-v1',
  steps: createWerewolfSteps()
};

function registerWerewolfWorkflow() {
  registerWorkflow(werewolfWorkflow, createWerewolfHandlers());
}

function createWerewolfWorkflowMatch(config) {
  registerWerewolfWorkflow();
  const state = createInitialWerewolfState(config);
  return workflowService.createWorkflowMatch({
    workflowId: WEREWOLF_WORKFLOW_ID,
    gameType: 'werewolf',
    config: {
      werewolfMode: state.werewolfMode?.id || config.werewolfMode?.id || config.werewolfMode || 'standard',
      hostId: config.host?.id || null,
      selectedPlayerIds: (config.players || []).map((player) => player.id),
      clientViewMode: config.clientViewMode || 'god'
    },
    initialState: state
  });
}

async function runWerewolfWorkflow(config, options = {}) {
  const match = createWerewolfWorkflowMatch(config);
  await flushOutbox(match.id, options.onEvent);
  while (true) {
    const { processed, match: current } = await workflowService.drainAiTasks(match.id, { maxTasks: 1 });
    await flushOutbox(match.id, options.onEvent);
    if (!processed || ['completed', 'failed', 'paused_debug'].includes(current?.status)) break;
  }
  const finalMatch = workflowService.getDebugState(match.id)?.match;
  return serializeWerewolfState(finalMatch, finalMatch.state);
}

async function flushOutbox(matchId, onEvent) {
  const messages = workflowService.listPendingOutbox(matchId);
  for (const message of messages) {
    const payload = message.payload?.payload || {};
    await onEvent?.({
      type: 'workflow-event',
      matchId,
      event: message.payload,
      workflowEvent: payload.workflowEvent,
      message: payload.message,
      game: payload.game,
      actionWindow: payload.actionWindow,
      effects: payload.effects
    });
    workflowService.markOutboxSent(message.id);
  }
}

module.exports = {
  WEREWOLF_WORKFLOW_ID,
  werewolfWorkflow,
  registerWerewolfWorkflow,
  createWerewolfWorkflowMatch,
  runWerewolfWorkflow,
  serializeWerewolfState
};
