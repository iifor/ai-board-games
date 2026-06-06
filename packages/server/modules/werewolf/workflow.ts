import * as workflowService from '../workflow-engine/service';
import { registerWorkflow } from '../workflow-engine/workflowRegistry';
import type { StepHandler, Workflow } from '../workflow-engine/workflowRegistry';
import { createTraceContext, flushTrace, markTraceComplete, markTraceError } from '../observability';
import { createWerewolfSteps } from './steps';
import { createWerewolfHandlers } from './handlers';
import { createInitialWerewolfState, serializeWerewolfState, registerMatchInfra, unregisterMatchInfra, flushMatchEventPublishes } from './runtime';
import { createEventBusWithDefaults } from './eventBus';
import { createGameEventBuilder } from './gameEventBuilder';
import { createEventDeliverySubscriber } from './eventDeliverySubscriber';
import { createChannelRouter } from './channelRouter';
import { createAudienceStream } from './audienceStream';
import { randomBytes } from 'crypto';

const WEREWOLF_WORKFLOW_ID = 'werewolf.workflow.basic.v1';

const werewolfWorkflow: Workflow = {
  id: WEREWOLF_WORKFLOW_ID,
  gameType: 'werewolf',
  steps: createWerewolfSteps() as unknown as Workflow['steps']
};

function registerWerewolfWorkflow(): void {
  registerWorkflow(werewolfWorkflow, createWerewolfHandlers() as unknown as Record<string, StepHandler>);
}

function createWerewolfWorkflowMatch(config: Record<string, unknown>, matchId?: string): Record<string, unknown> {
  registerWerewolfWorkflow();
  const state = createInitialWerewolfState(config);
  return workflowService.createWorkflowMatch({
    workflowId: WEREWOLF_WORKFLOW_ID,
    gameType: 'werewolf',
    matchId,
    config: {
      werewolfMode: (state.werewolfMode as { id?: string })?.id || (config.werewolfMode as { id?: string })?.id || config.werewolfMode || 'standard',
      selectedPlayerIds: ((config.players || []) as Array<{ id: number }>).map((player) => player.id),
      debugMode: Boolean(config.debugMode),
      clientViewMode: config.clientViewMode || 'god'
    },
    initialState: state
  }) as unknown as Record<string, unknown>;
}

async function runWerewolfWorkflow(config: Record<string, unknown>, options: { onEvent?: (event: Record<string, unknown>) => void } = {}): Promise<Record<string, unknown>> {
  // Phase 5-6: EventBus 必须在 createWorkflowMatch 之前创建（首个 tickMatch 需要用它发布事件）
  const matchId = `werewolf-${Date.now()}-${randomBytes(6).toString('hex')}`;
  const eventBus = createEventBusWithDefaults();
  const gameEventBuilder = createGameEventBuilder(matchId);
  registerMatchInfra(matchId, eventBus, gameEventBuilder);
  createChannelRouter(eventBus);
  createAudienceStream(eventBus);
  

  const deliverySubscriber = options.onEvent
    ? createEventDeliverySubscriber(eventBus, options.onEvent)
    : null;
  if (deliverySubscriber) {
    deliverySubscriber.start();
  }

  const match = createWerewolfWorkflowMatch(config, matchId);
  const isDebug = Boolean(config.debugMode);
  const trace = isDebug ? null : createTraceContext(match.id as string, 'werewolf', String(config.werewolfMode || 'workflow'));
  try {
    while (true) {
      const { processed, match: current } = await workflowService.drainAiTasks(match.id as string, { maxTasks: 1 });
      if (!processed || ['completed', 'failed', 'paused_debug'].includes(current?.status as string)) break;
    }
    const finalMatch = workflowService.getDebugState(match.id as string)?.match || match;
    await flushMatchEventPublishes(match.id as string);
    assertWerewolfWorkflowCompleted(finalMatch as Record<string, unknown>);
    if (trace) { markTraceComplete(trace); /* flushTrace 推迟到 runSession 中 saveGameRecord 之后 */ }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = serializeWerewolfState(finalMatch as any, (finalMatch as Record<string, unknown>).state as import('./runtime').WerewolfState);
    return result;
  } catch (error) {
    if (trace) { markTraceError(trace, (error as Error).message || String(error)); flushTrace(trace); }
    throw error;
  } finally {
    // 清理 EventBus 订阅器和基础设施
    await flushMatchEventPublishes(match.id as string);
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

function assertWerewolfWorkflowCompleted(match: Record<string, unknown>): void {
  const status = String(match.status || 'unknown');
  if (status === 'completed') return;
  const matchError = match.error && typeof match.error === 'object'
    ? match.error as Record<string, unknown>
    : {};
  const detail = String(matchError.message || 'workflow stopped before completion');
  throw new Error(`狼人杀工作流异常停止（${status}）：${detail}`);
}

export {
  WEREWOLF_WORKFLOW_ID,
  werewolfWorkflow,
  registerWerewolfWorkflow,
  createWerewolfWorkflowMatch,
  runWerewolfWorkflow,
  assertWerewolfWorkflowCompleted,
  serializeWerewolfState
};
