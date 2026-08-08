/**
 * 辩论赛 GameEngine runner
 *
 * 通过 GameEngine 统一入口创建对局，使用 workflow-engine 执行。
 * 对局创建经过 GameEngine（definition 注册 + 元数据），
 * 执行使用 drainAiTasks 循环（已验证的路径）。
 */

import { getGameEngine } from './engine-registry';
import { claimPendingOutbox, drainAiTasks, markOutboxSent, releaseOutboxClaim, getDebugState } from './workflow-engine/service';
import { createInitialDebateState, serializeDebateState } from './debate/helpers';
import type { DebateConfig, SerializedGame } from './debate/utils';
import type { WorkflowMatch, WorkflowEvent } from './debate/helpers';

/**
 * 通过 GameEngine 运行辩论赛
 *
 * 1. 通过 engine.createMatch() 创建对局（经过 definition 注册）
 * 2. 通过 drainAiTasks() 循环驱动 AI 执行
 * 3. 通过 flushOutbox() 推送事件
 */
async function runDebateViaEngine(
  config: DebateConfig,
  options: { onEvent?: (event: Record<string, unknown>) => void } = {},
): Promise<SerializedGame> {
  const engine = getGameEngine();

  // 通过 GameEngine 创建对局
  const runtimeConfig = {
    topic: config.topic,
    debateTeams: config.debateTeams,
    selectedPlayerIds: (config as Record<string, unknown>).selectedPlayerIds || (config.players || []).map((player) => player.id),
    debugMode: Boolean(config.debugMode),
  };
  const matchResult = await engine.createMatch({
    gameType: 'debate',
    config: runtimeConfig,
    initialState: await createInitialDebateState(config) as unknown as Record<string, unknown>,
  });
  const matchId = (matchResult as unknown as { id: string }).id;

  // Flush initial outbox
  await flushOutbox(matchId, options.onEvent);

  // 通过 drainAiTasks 循环推进（与 runDebateWorkflow 相同的执行路径）
  while (true) {
    const { processed, match: current } = await drainAiTasks(matchId, { maxTasks: 1 }) as unknown as { processed: boolean; match: WorkflowMatch };
    await flushOutbox(matchId, options.onEvent);
    if (!processed || ['completed', 'failed', 'paused_debug'].includes(current?.status)) break;
  }

  // 获取最终状态并序列化
  const debugState = await getDebugState(matchId) as unknown as { match: WorkflowMatch };
  const finalMatch = debugState?.match;
  return serializeDebateState(finalMatch, finalMatch.state) as unknown as SerializedGame;
}

async function flushOutbox(matchId: string, onEvent?: (event: Record<string, unknown>) => void): Promise<void> {
  while (true) {
    const message = await claimPendingOutbox(matchId) as unknown as WorkflowEvent | null;
    if (!message) return;
    try {
      await onEvent?.(projectDebateOutboxEvent(message, matchId));
      await markOutboxSent(message.id as unknown as number);
    } catch (error) {
      await releaseOutboxClaim(message.id as unknown as number);
      throw error;
    }
  }
}

function projectDebateOutboxEvent(message: WorkflowEvent, matchId: string): Record<string, unknown> {
  const event = (message.payload || {}) as Record<string, unknown>;
  const payload = event.payload && typeof event.payload === 'object'
    ? event.payload as Record<string, unknown>
    : {};
  const eventType = String(event.type || '');
  const base = {
    matchId,
    event,
    workflowEvent: payload.workflowEvent || eventType,
    message: payload.message,
    game: payload.game,
    phase: payload.phase,
    speech: payload.speech,
  };
  if (eventType === 'speech') {
    return { type: 'speech', ...base };
  }
  return { type: 'workflow-event', ...base };
}

export { runDebateViaEngine };
