/**
 * 狼人杀 GameEngine runner
 *
 * 通过 GameEngine 统一入口创建对局，使用 workflow-engine 执行。
 * 保留完整的 EventBus 基础设施（ChannelRouter、AudienceStream、EventDelivery）。
 */

import { getGameEngine } from './engine-registry';
import { createTraceContext, flushTrace, markTraceComplete, markTraceError } from './observability';
import { createInitialWerewolfState, serializeWerewolfState, registerMatchInfra, unregisterMatchInfra, flushMatchEventPublishes } from './werewolf/runtime';
import { createEventBusWithDefaults } from './werewolf/eventBus';
import { createGameEventBuilder } from './werewolf/gameEventBuilder';
import { createEventDeliverySubscriber } from './werewolf/eventDeliverySubscriber';
import { createChannelRouter } from './werewolf/channelRouter';
import { createAudienceStream } from './werewolf/audienceStream';
import { randomBytes } from 'crypto';

/**
 * 通过 GameEngine 运行狼人杀
 *
 * 1. 设置 EventBus 基础设施（与 runWerewolfWorkflow 相同）
 * 2. 通过 engine.createMatch() 创建对局（经过 definition 注册）
 * 3. 通过 GameEngine 持续驱动到等待点或终态
 * 4. 清理基础设施
 */
async function runWerewolfViaEngine(
  config: Record<string, unknown>,
  options: { onEvent?: (event: Record<string, unknown>) => void } = {},
): Promise<Record<string, unknown>> {
  const engine = getGameEngine();

  // Phase 5-6: EventBus 必须在 createWorkflowMatch 之前创建
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

  // 通过 GameEngine 创建对局
  const state = await createInitialWerewolfState(config);
  const matchResult = engine.createMatch({
    gameType: 'werewolf',
    matchId,
    config: {
      werewolfMode: (state.werewolfMode as { id?: string })?.id || (config.werewolfMode as { id?: string })?.id || config.werewolfMode || 'standard',
      selectedPlayerIds: ((config.players || []) as Array<{ id: number }>).map((player) => player.id),
      debugMode: Boolean(config.debugMode),
      clientViewMode: config.clientViewMode || 'god',
    },
    initialState: state,
  });
  const actualMatchId = (matchResult as unknown as { id: string }).id;

  const isDebug = Boolean(config.debugMode);
  const trace = isDebug ? null : createTraceContext(
    actualMatchId,
    'werewolf',
    String(config.werewolfMode || 'workflow'),
    statePlayers(matchResult) as Array<Record<string, unknown>>,
  );

  try {
    const { match: drivenMatch } = await engine.runUntilBlocked(actualMatchId);
    const finalMatch = drivenMatch || engine.getDebugState(actualMatchId).match || matchResult;
    await flushMatchEventPublishes(actualMatchId);
    assertWerewolfWorkflowCompleted(finalMatch as unknown as Record<string, unknown>, { allowPausedDebug: isDebug });
    if (trace) { markTraceComplete(trace); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = serializeWerewolfState(finalMatch as any, (finalMatch as unknown as Record<string, unknown>).state as import('./werewolf/runtime').WerewolfState);
    return result;
  } catch (error) {
    if (trace) { markTraceError(trace, (error as Error).message || String(error)); flushTrace(trace); }
    throw error;
  } finally {
    await flushMatchEventPublishes(actualMatchId);
    if (deliverySubscriber) {
      deliverySubscriber.stop();
      const errors = deliverySubscriber.getErrorCount();
      if (errors > 0) {
        console.warn(`[runWerewolfViaEngine] EventDelivery 捕获到 ${errors} 个错误`);
      }
    }
    unregisterMatchInfra(actualMatchId);
  }
}

function statePlayers(match: unknown): unknown[] {
  const state = (match as Record<string, unknown>)?.state as { players?: unknown[] } | undefined;
  return Array.isArray(state?.players) ? state.players : [];
}

function assertWerewolfWorkflowCompleted(
  match: Record<string, unknown>,
  options: { allowPausedDebug?: boolean } = {},
): void {
  const status = String(match.status || 'unknown');
  if (status === 'completed') return;
  if (options.allowPausedDebug && status === 'paused_debug') return;
  const matchError = match.error && typeof match.error === 'object'
    ? match.error as Record<string, unknown>
    : {};
  const detail = String(matchError.message || 'workflow stopped before completion');
  throw new Error(`狼人杀工作流异常停止（${status}）：${detail}`);
}

export { runWerewolfViaEngine };
