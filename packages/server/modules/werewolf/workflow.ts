const workflowService = require('../workflow-engine/service');
import { registerWorkflow } from '../workflow-engine/workflowRegistry';
import type { StepHandler, Workflow } from '../workflow-engine/workflowRegistry';
import { createTraceContext, flushTrace, markTraceComplete, markTraceError } from '../observability';
import { createWerewolfSteps } from './steps';
import { createWerewolfHandlers } from './handlers';
import { createInitialWerewolfState, serializeWerewolfState, registerMatchInfra, unregisterMatchInfra } from './runtime';
import { createEventBusWithDefaults } from './eventBus';
import { createGameEventBuilder } from './gameEventBuilder';
import { createEventDeliverySubscriber } from './eventDeliverySubscriber';
import { createChannelRouter } from './channelRouter';
import type { ChannelRouter } from './channelRouter';
import { createAudienceStream } from './audienceStream';
import type { AudienceStream } from './audienceStream';

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
      debugMode: Boolean(config.debugMode),
      clientViewMode: config.clientViewMode || 'god'
    },
    initialState: state
  });
}

async function runWerewolfWorkflow(config: Record<string, unknown>, options: { onEvent?: (event: Record<string, unknown>) => void } = {}): Promise<Record<string, unknown>> {
  const match = createWerewolfWorkflowMatch(config);
  const trace = createTraceContext(match.id as string, 'werewolf', String(config.werewolfMode || 'workflow'));

  // Phase 5-6: EventBus + ChannelRouter + AudienceStream (完整事件驱动栈)
  const eventBus = createEventBusWithDefaults();
  const gameEventBuilder = createGameEventBuilder(match.id as string);
  const channelRouter = createChannelRouter(eventBus);
  const audienceStream = createAudienceStream(eventBus);
  registerMatchInfra(match.id as string, eventBus, gameEventBuilder);

  // Phase 5: 用 EventBus 订阅替代 outbox 轮询
  const deliverySubscriber = options.onEvent
    ? createEventDeliverySubscriber(eventBus, options.onEvent)
    : null;
  if (deliverySubscriber) {
    deliverySubscriber.start();
  }

  try {
    while (true) {
      const { processed, match: current } = await workflowService.drainAiTasks(match.id, { maxTasks: 1 });
      if (!processed || ['completed', 'failed', 'paused_debug'].includes(current?.status)) break;
    }
    const finalMatch = workflowService.getDebugState(match.id)?.match || match;
    markTraceComplete(trace);
    flushTrace(trace);
    const result = serializeWerewolfState(finalMatch, finalMatch.state);
    // Phase 6: 暴露 ChannelRouter 和 AudienceStream 供 game-socket 使用
    return Object.assign(result, {
      _channelRouter: channelRouter,
      _audienceStream: audienceStream,
      _eventBus: eventBus,
    });
  } catch (error) {
    markTraceError(trace, (error as Error).message || String(error));
    flushTrace(trace);
    throw error;
  } finally {
    // 清理 EventBus 订阅器和基础设施
    if (deliverySubscriber) {
      deliverySubscriber.stop();
      const errors = deliverySubscriber.getErrorCount();
      if (errors > 0) {
        console.warn(`[runWerewolfWorkflow] EventDelivery 捕获到 ${errors} 个错误`);
      }
    }
    unregisterMatchInfra(match.id as string);
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
