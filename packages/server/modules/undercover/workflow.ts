import { randomBytes } from 'node:crypto';
import type { GameRuntimeRunContext } from '../../../shared/types/gameEngine';
import { getAiConfig } from '../../config/ai';
import type { Match } from '../../types/workflow';
import { createTraceContext, flushTrace, getActiveTrace, markTraceComplete, markTraceError } from '../observability';
import {
  createWorkflowMatch,
  drainAiTasks,
  getDebugState,
  listPendingOutbox,
  markOutboxSent,
  registerWorkflow,
} from '../workflow-engine';
import type { Workflow } from '../workflow-engine/workflowRegistry';
import { createUndercoverHandlers } from './handlers';
import { toUndercoverPublicState } from './presentation';
import { createInitialUndercoverState } from './rules';
import type { UndercoverPlayerInput } from './types';

const UNDERCOVER_WORKFLOW_ID = 'undercover.workflow.standard.v1';

interface UndercoverRuntimeConfig extends Record<string, unknown> {
  selectedPlayerIds?: number[];
  players?: UndercoverPlayerInput[];
  debugMode?: boolean;
  debug?: {
    seed?: number;
    civilianWord?: string;
    undercoverWord?: string;
    undercoverPlayerId?: number;
  };
}

const steps: Workflow['steps'] = [
  { id: 'setup', type: 'undercover.setup', name: '初始化', config: {} },
  ...[1, 2, 3].flatMap((round) => [
    { id: `round_${round}_start`, type: 'undercover.round_start', name: `第${round}轮开始`, config: { round } },
    ...Array.from({ length: 6 }, (_, orderIndex) => ({
      id: `round_${round}_speech_${orderIndex}`,
      type: 'undercover.speech',
      name: `第${round}轮发言${orderIndex + 1}`,
      config: { round, orderIndex },
    })),
    { id: `round_${round}_vote`, type: 'undercover.vote', name: `第${round}轮投票`, config: { round, runoff: false } },
    { id: `round_${round}_runoff`, type: 'undercover.vote', name: `第${round}轮复投`, config: { round, runoff: true } },
    { id: `round_${round}_resolve`, type: 'undercover.resolve', name: `第${round}轮结算`, config: { round } },
  ]),
  { id: 'result', type: 'undercover.result', name: '结果揭晓', config: {} },
];

const undercoverWorkflow: Workflow = {
  id: UNDERCOVER_WORKFLOW_ID,
  gameType: 'undercover',
  steps,
};

function registerUndercoverWorkflow(): void {
  registerWorkflow(undercoverWorkflow, createUndercoverHandlers());
}

function createUndercoverWorkflowMatch(config: UndercoverRuntimeConfig): Match {
  registerUndercoverWorkflow();
  const players = resolvePlayers(config);
  const debugMode = config.debugMode === true;
  const debug = debugMode ? config.debug || {} : {};
  const seed = Number.isInteger(debug.seed) ? Number(debug.seed) : randomBytes(4).readUInt32BE(0);
  const wordPair = debug.civilianWord && debug.undercoverWord
    ? { civilian: debug.civilianWord, undercover: debug.undercoverWord }
    : undefined;
  const matchId = `undercover-${Date.now()}-${randomBytes(6).toString('hex')}`;
  const initialState = createInitialUndercoverState(players, {
    seed,
    wordPair,
    undercoverPlayerId: debug.undercoverPlayerId,
  });
  initialState.id = matchId;
  return createWorkflowMatch({
    workflowId: UNDERCOVER_WORKFLOW_ID,
    gameType: 'undercover',
    matchId,
    config: {
      selectedPlayerIds: players.map((player) => player.id),
      debugMode,
    },
    initialState: { ...initialState, completedSteps: {} },
  });
}

async function runUndercoverWorkflow(matchId: string, context: GameRuntimeRunContext = {}): Promise<Record<string, unknown>> {
  const initial = getDebugState(matchId)?.match;
  if (!initial) throw new Error(`Undercover match not found: ${matchId}`);
  const trace = initial.config.debugMode
    ? null
    : getActiveTrace(matchId) || createTraceContext(matchId, 'undercover', 'standard-6', initial.state.players as Array<Record<string, unknown>>);
  try {
    await flushOutbox(matchId, context.onEvent);
    while (true) {
      const { processed, match } = await drainAiTasks(matchId, { maxTasks: 1 });
      await flushOutbox(matchId, context.onEvent);
      if (match && ['completed', 'failed', 'paused_debug'].includes(match.status)) break;
      if (!processed) throw new Error(`Undercover workflow stalled: ${matchId}`);
    }
    const finalMatch = getDebugState(matchId)?.match;
    if (!finalMatch) throw new Error(`Undercover match disappeared: ${matchId}`);
    assertUndercoverWorkflowCompleted(finalMatch);
    const publicState = toUndercoverPublicState(finalMatch.state as unknown as Parameters<typeof toUndercoverPublicState>[0]) as unknown as Record<string, unknown>;
    if (trace) {
      markTraceComplete(trace);
      flushTrace(trace);
    }
    return publicState;
  } catch (error) {
    if (trace) {
      markTraceError(trace, error instanceof Error ? error.message : String(error));
      flushTrace(trace);
    }
    throw error;
  }
}

function assertUndercoverWorkflowCompleted(match: Match): void {
  if (match.status === 'completed') return;
  const matchError = match.error && typeof match.error === 'object'
    ? match.error as Record<string, unknown>
    : {};
  const detail = String(matchError.message || 'workflow stopped before completion');
  throw new Error(`谁是卧底工作流异常停止（${match.status || 'unknown'}）：${detail}`);
}

function resolvePlayers(config: UndercoverRuntimeConfig): UndercoverPlayerInput[] {
  if (Array.isArray(config.players) && config.players.length) return config.players;
  const ids = (config.selectedPlayerIds || []).map(Number);
  return getAiConfig().players
    .filter((player) => ids.includes(Number(player.id)))
    .map((player) => ({ id: player.id, nickname: player.nickname, avatar: player.avatar }));
}

async function flushOutbox(matchId: string, onEvent?: (event: Record<string, unknown>) => void): Promise<void> {
  for (const message of listPendingOutbox(matchId)) {
    const storedEvent = message.payload as { payload?: Record<string, unknown> };
    if (storedEvent.payload) await onEvent?.(storedEvent.payload);
    markOutboxSent(message.id as number);
  }
}

export {
  UNDERCOVER_WORKFLOW_ID,
  undercoverWorkflow,
  registerUndercoverWorkflow,
  createUndercoverWorkflowMatch,
  runUndercoverWorkflow,
};
export type { UndercoverRuntimeConfig };
