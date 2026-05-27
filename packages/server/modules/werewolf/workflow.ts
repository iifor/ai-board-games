const workflowService = require('../workflow-engine/service');
import { registerWorkflow } from '../workflow-engine/workflowRegistry';
import type { StepHandler, Workflow } from '../workflow-engine/workflowRegistry';
import { createTraceContext, flushTrace, getActiveTrace, markTraceComplete, markTraceError, recordEvent } from '../observability';
import { createWerewolfSteps } from './steps';
import { createWerewolfHandlers } from './handlers';
import { ACTION_LABELS } from './messages';
import { createInitialWerewolfState, serializeWerewolfState } from './runtime';

const WEREWOLF_WORKFLOW_ID = 'werewolf.workflow.basic.v1';

const werewolfWorkflow: Workflow = {
  id: WEREWOLF_WORKFLOW_ID,
  gameType: 'werewolf',
  steps: createWerewolfSteps() as unknown as Workflow['steps']
};

function registerWerewolfWorkflow(): void {
  registerWorkflow(werewolfWorkflow, createWerewolfHandlers() as unknown as Record<string, StepHandler>);
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
  const trace = createTraceContext(match.id as string, 'werewolf', String(config.werewolfMode || 'workflow'));
  try {
    await flushOutbox(match.id as string, options.onEvent);
    while (true) {
      const { processed, match: current } = await workflowService.drainAiTasks(match.id, { maxTasks: 1 });
      await flushOutbox(match.id as string, options.onEvent);
      if (!processed || ['completed', 'failed', 'paused_debug'].includes(current?.status)) break;
    }
    const finalMatch = workflowService.getDebugState(match.id)?.match || match;
    markTraceComplete(trace);
    flushTrace(trace);
    return serializeWerewolfState(finalMatch, finalMatch.state);
  } catch (error) {
    markTraceError(trace, (error as Error).message || String(error));
    flushTrace(trace);
    throw error;
  }
}

async function flushOutbox(matchId: string, onEvent?: (event: Record<string, unknown>) => void): Promise<void> {
  const messages = workflowService.listPendingOutbox(matchId);
  for (const message of messages) {
    const event = projectWorkflowOutboxEvent(matchId, message.payload as WorkflowEventPayload);
    recordWorkflowOutbox(matchId, event);
    await onEvent?.(event);
    workflowService.markOutboxSent(message.id);
  }
}

interface WorkflowEventPayload {
  type?: string;
  stepId?: string;
  playerId?: string | number;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

function projectWorkflowOutboxEvent(matchId: string, workflowEvent: WorkflowEventPayload): Record<string, unknown> {
  const payload = (workflowEvent?.payload || {}) as Record<string, unknown>;
  const game = payload.game || currentSerializedGame(matchId);
  const base = {
    type: 'workflow-event',
    matchId,
    event: workflowEvent,
    workflowEvent: payload.workflowEvent || workflowEvent.type,
    message: payload.message,
    game,
    actionWindow: payload.actionWindow,
    effects: payload.effects
  };
  if (workflowEvent.type === 'werewolf_action_submitted') {
    return { ...base, ...projectWerewolfAction(payload, game as Record<string, unknown>) };
  }
  return base;
}

function projectWerewolfAction(payload: Record<string, unknown>, game: Record<string, unknown>): Record<string, unknown> {
  const actionType = String(payload.actionType || '');
  const actorId = payload.actorId as number | string | undefined;
  if (actionType === 'day_speech') {
    return {
      message: payload.text,
      speech: {
        playerId: actorId,
        text: String(payload.text || ''),
        thinking: String(payload.thinking || '')
      },
      game
    };
  }
  if ((actionType === 'wolf_kill' || actionType === 'wolf_speech') && payload.speech) {
    return {
      message: payload.speech,
      speech: {
        playerId: actorId,
        text: String(payload.speech || ''),
        thinking: String(payload.thinking || '')
      },
      game
    };
  }
  return {
    message: `${actorId || '玩家'}号完成${ACTION_LABELS[actionType] || '行动'}。`,
    game
  };
}

function currentSerializedGame(matchId: string): Record<string, unknown> | null {
  const match = workflowService.getDebugState(matchId)?.match;
  if (!match) return null;
  return serializeWerewolfState(match, match.state);
}

function recordWorkflowOutbox(matchId: string, event: Record<string, unknown>): void {
  const trace = getActiveTrace(matchId);
  if (!trace) return;
  recordEvent(trace, {
    type: String(event.workflowEvent || event.type || 'workflow-event'),
    phase: String((event.actionWindow as Record<string, unknown> | undefined)?.phase || ''),
    event
  });
}

export {
  WEREWOLF_WORKFLOW_ID,
  werewolfWorkflow,
  registerWerewolfWorkflow,
  createWerewolfWorkflowMatch,
  runWerewolfWorkflow,
  serializeWerewolfState
};
