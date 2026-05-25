const workflowService = require('../workflow-engine/service');
import { registerWorkflow } from '../workflow-engine/workflowRegistry';
import type { Workflow } from '../workflow-engine/workflowRegistry';
import { createWerewolfSteps } from './steps';
import { createWerewolfHandlers } from './handlers';
import { createInitialWerewolfState, serializeWerewolfState } from './runtime';

const WEREWOLF_WORKFLOW_ID = 'werewolf.workflow.basic.v1';

const werewolfWorkflow: Workflow = {
  id: WEREWOLF_WORKFLOW_ID,
  gameType: 'werewolf',
  steps: createWerewolfSteps() as unknown as Workflow['steps']
};

function registerWerewolfWorkflow(): void {
  registerWorkflow(werewolfWorkflow, createWerewolfHandlers() as unknown as Record<string, import('../workflow-engine/workflowRegistry').StepHandler>);
}

function createWerewolfWorkflowMatch(config: Record<string, unknown>): Record<string, unknown> {
  registerWerewolfWorkflow();
  const state = createInitialWerewolfState(config);
  return workflowService.createWorkflowMatch({
    workflowId: WEREWOLF_WORKFLOW_ID,
    gameType: 'werewolf',
    config: {
      werewolfMode: (state.werewolfMode as { id?: string })?.id || (config.werewolfMode as { id?: string })?.id || config.werewolfMode || 'standard',
      hostId: (config.host as { id?: number })?.id || null,
      selectedPlayerIds: ((config.players || []) as Array<{ id: number }>).map((player) => player.id),
      clientViewMode: config.clientViewMode || 'god'
    },
    initialState: state
  });
}

async function runWerewolfWorkflow(config: Record<string, unknown>, options: { onEvent?: (event: Record<string, unknown>) => void } = {}): Promise<Record<string, unknown>> {
  const match = createWerewolfWorkflowMatch(config);
  await flushOutbox(match.id as string, options.onEvent);
  while (true) {
    const { processed, match: current } = await workflowService.drainAiTasks(match.id, { maxTasks: 1 });
    await flushOutbox(match.id as string, options.onEvent);
    if (!processed || ['completed', 'failed', 'paused_debug'].includes(current?.status)) break;
  }
  const finalMatch = workflowService.getDebugState(match.id)?.match;
  return serializeWerewolfState(finalMatch, finalMatch.state);
}

async function flushOutbox(matchId: string, onEvent?: (event: Record<string, unknown>) => void): Promise<void> {
  const messages = workflowService.listPendingOutbox(matchId);
  for (const message of messages) {
    const payload = (message.payload?.payload || {}) as Record<string, unknown>;
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

export {
  WEREWOLF_WORKFLOW_ID,
  werewolfWorkflow,
  registerWerewolfWorkflow,
  createWerewolfWorkflowMatch,
  runWerewolfWorkflow,
  serializeWerewolfState
};
