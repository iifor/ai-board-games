import type {
  GameRuntimeAbortSignal,
  GameRuntimeRunContext,
} from '@ai-presenter/shared/types/gameEngine';
import type { Match } from '../../../types/workflow';
import {
  claimPendingOutbox,
  drainAiTasks,
  getDebugState,
  markOutboxSent,
  releaseOutboxClaim,
} from '../../workflow-engine';
import {
  createTraceContext,
  flushTrace,
  getActiveTrace,
  markTraceComplete,
  markTraceError,
} from '../../observability';

const TERMINAL_MATCH_STATUSES = new Set(['completed', 'failed', 'paused_debug']);
const RETRY_POLL_INTERVAL_MS = 100;
const RETRY_POLL_MAX_MS = 1000;

interface WorkflowGameRuntimeOptions {
  matchId: string;
  gameType: string;
  mode: string;
  errorLabel: string;
  context?: GameRuntimeRunContext;
  projectState: (state: Record<string, unknown>) => Record<string, unknown>;
  waitForIdle?: (
    matchId: string,
    match: Match | null,
    signal?: GameRuntimeAbortSignal,
  ) => Promise<boolean>;
}

async function runWorkflowGameRuntime({
  matchId,
  gameType,
  mode,
  errorLabel,
  context = {},
  projectState,
  waitForIdle,
}: WorkflowGameRuntimeOptions): Promise<Record<string, unknown>> {
  const initial = (await getDebugState(matchId))?.match;
  if (!initial) throw new Error(`${errorLabel} match not found: ${matchId}`);
  const trace = initial.config.debugMode
    ? null
    : getActiveTrace(matchId) || createTraceContext(
        matchId,
        gameType,
        mode,
        initial.state.players as Array<Record<string, unknown>>,
      );
  try {
    throwIfAborted(context.signal, errorLabel);
    await flushWorkflowOutbox(matchId, context.onEvent);
    while (true) {
      throwIfAborted(context.signal, errorLabel);
      const { processed, match } = await drainAiTasks(matchId, { maxTasks: 1 });
      await flushWorkflowOutbox(matchId, context.onEvent);
      throwIfAborted(context.signal, errorLabel);
      if (match && TERMINAL_MATCH_STATUSES.has(match.status)) break;
      if (!processed && await waitForRetryingAiTask(matchId, context.signal)) continue;
      if (!processed && waitForIdle && await waitForIdle(matchId, match, context.signal)) continue;
      if (!processed) throw new Error(`${errorLabel} workflow stalled: ${matchId}`);
    }
    const finalMatch = (await getDebugState(matchId))?.match;
    if (!finalMatch) throw new Error(`${errorLabel} match disappeared: ${matchId}`);
    assertWorkflowCompleted(finalMatch, errorLabel);
    if (trace) {
      markTraceComplete(trace);
      flushTrace(trace);
    }
    return projectState(finalMatch.state as Record<string, unknown>);
  } catch (error) {
    if (trace) {
      markTraceError(trace, error instanceof Error ? error.message : String(error));
      flushTrace(trace);
    }
    throw error;
  }
}

async function waitForRetryingAiTask(
  matchId: string,
  signal?: GameRuntimeAbortSignal,
): Promise<boolean> {
  const state = await getDebugState(matchId);
  const retryingTask = state?.aiTasks?.find((task) =>
    task.status === 'retrying' && Number(task.attempts || 0) < Number(task.maxAttempts || 3)
  );
  if (!retryingTask) return false;
  const retryAt = Date.parse(retryingTask.nextAttemptAt || '');
  const remaining = Number.isFinite(retryAt) ? retryAt - Date.now() : RETRY_POLL_INTERVAL_MS;
  await waitForRetryDelay(Math.max(0, Math.min(RETRY_POLL_MAX_MS, remaining)), signal);
  return true;
}

function waitForRetryDelay(delayMs: number, signal?: GameRuntimeAbortSignal): Promise<void> {
  if (signal?.aborted) throwIfAborted(signal, 'Workflow');
  return new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(signal?.reason instanceof Error ? signal.reason : new Error('Workflow runtime aborted'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function flushWorkflowOutbox(
  matchId: string,
  onEvent?: (event: Record<string, unknown>) => void,
): Promise<void> {
  while (true) {
    const message = await claimPendingOutbox(matchId);
    if (!message) return;
    try {
      const storedEvent = message.payload as { payload?: Record<string, unknown> };
      if (storedEvent.payload) await onEvent?.(storedEvent.payload);
      await markOutboxSent(message.id as number);
    } catch (error) {
      await releaseOutboxClaim(message.id as number);
      throw error;
    }
  }
}

function throwIfAborted(signal: GameRuntimeAbortSignal | undefined, label: string): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new Error(`${label} runtime aborted`);
}

function assertWorkflowCompleted(match: Match, errorLabel: string): void {
  if (match.status === 'completed') return;
  const matchError = match.error && typeof match.error === 'object'
    ? match.error as Record<string, unknown>
    : {};
  const detail = String(matchError.message || 'workflow stopped before completion');
  throw new Error(`${errorLabel}工作流异常停止（${match.status || 'unknown'}）：${detail}`);
}

export { runWorkflowGameRuntime };
export type { WorkflowGameRuntimeOptions };
