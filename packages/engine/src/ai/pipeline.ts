import { EngineInputError } from '../errors';
import { aiExecutorFor } from '../phases/registry';
import type { ExecEnv } from '../runtime/env';
import { finishGame } from '../runtime/flow';
import type { PendingRequest } from '../runtime/types';
import { formatZodIssues } from './outputContract';
import { draftFromPending, issueRequest } from './requests';

export const DEFAULT_RETRIES = 1;

export type AiReply = { readonly output: unknown } | { readonly failed: string };

function takePending(env: ExecEnv, requestId: string): PendingRequest {
  const index = env.s.pending.findIndex((item) => item.id === requestId);
  const pending = env.s.pending[index];
  if (!pending) throw new EngineInputError(`未知或已处理的 AI 请求：${requestId}`);
  if (pending.phaseId !== env.s.cursor.phaseId || pending.visit !== env.s.cursor.visit) {
    throw new EngineInputError(`AI 请求 ${requestId} 已过期`);
  }
  env.s.pending.splice(index, 1);
  return pending;
}

function applyFallback(env: ExecEnv, pending: PendingRequest, reason: string): void {
  const phase = env.phase();
  const executor = aiExecutorFor(phase);
  env.log({ kind: 'fallback', seat: pending.seat, reason, channel: 'host', action: pending.action });
  const applied = executor.skipFailed(env, phase, pending);
  env.record('decision', '兜底', { reason, applied }, { seat: pending.seat });
}

/** 接收一条 AI 回复：解析 → 合法性 → 内容校验；失败时带原因重问，次数用尽后走兜底 */
export function receiveAiReply(env: ExecEnv, requestId: string, reply: AiReply): void {
  const pending = takePending(env, requestId);
  if ('failed' in reply) {
    applyFallback(env, pending, `模型调用失败：${reply.failed}`);
    return;
  }

  const phase = env.phase();
  const executor = aiExecutorFor(phase);
  let gameOutput = reply.output;
  if (pending.memoryContext && gameOutput && typeof gameOutput === 'object' && !Array.isArray(gameOutput)) {
    const { memoryNote: _note, ...fields } = gameOutput as Record<string, unknown>;
    gameOutput = fields;
  }
  const parsed = executor.schema(env, phase, pending).safeParse(gameOutput);
  const error = parsed.success ? executor.check(env, phase, pending, parsed.data) : formatZodIssues(parsed.error);
  if (parsed.success && !error) {
    env.acceptedRequestId = requestId;
    env.acceptedOutput = parsed.data;
    env.record('decision', '采纳', { applied: parsed.data }, { seat: pending.seat });
    executor.store(env, phase, pending, parsed.data);
    return;
  }

  const reason = error ?? '输出不合法';
  const retries = 'retries' in phase ? phase.retries ?? DEFAULT_RETRIES : DEFAULT_RETRIES;
  if (pending.attempt <= retries) {
    env.record('decision', '校验拒绝', { reason }, { seat: pending.seat });
    if (!issueRequest(env, draftFromPending(env, pending), pending.attempt + 1, reason)) finishGame(env, 'budget');
    return;
  }
  applyFallback(env, pending, `输出不合法：${reason}`);
}
