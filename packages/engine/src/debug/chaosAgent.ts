import type { CompiledGame } from '../compiler/compile';
import { scriptedOutput } from './scriptedAgent';
import { EngineInputError } from '../errors';
import { ExecEnv } from '../runtime/env';
import type { Rng } from '../runtime/rng';
import type { AiRequest, EngineSnapshot, PendingRequest, Seat } from '../runtime/types';
import type { PhaseSpec } from '../spec/phases';

/** 脚本化回复：给出输出，或模拟一次模型调用失败 */
export type ScriptedReply = { readonly output: unknown } | { readonly failed: string };

/**
 * 混沌模式：在脚本化输出的基础上，以固定概率做出模型在真实对局里会做的"不配合"行为，
 * 让性质测试覆盖弃票、放弃、声明（如自爆）、重问与兜底这些默认脚本永远不会走到的分支。
 * 每个决定都由对局种子与请求 ID 派生，同一种子两次运行结果相同；默认的 scriptedOutput 保持不变。
 */
export const CHAOS_RATES = {
  /** 传输层失败（ai_failed）：引擎不重问，直接兜底 */
  failed: 0.03,
  /** 输出不合法（schema 或合法目标校验失败）：引擎带原因重问，重问再不合法则兜底 */
  invalid: 0.1,
  /** 允许弃票的投票弃票 */
  abstain: 0.3,
  /** 可放弃的动作放弃 */
  decline: 0.5,
  /** 发言时附带一个有权使用的声明（如自爆） */
  declare: 0.25,
} as const;

export const CHAOS_FAILURE_REASON = '混沌模式：模拟模型调用失败';

type Phase = PhaseSpec<unknown, unknown>;

/** 一定不合法的输出：投票与动作用不存在的 0 号座位（走合法目标校验），发言与判定用错误类型（走 schema 校验） */
function invalidOutput(phase: Phase): unknown {
  switch (phase.kind) {
    case 'vote':
      return { target: 0 };
    case 'act':
      return { targets: [0] };
    case 'speak':
      return { speech: 0 };
    default:
      return { verdict: '__chaos__', comment: '' };
  }
}

/** 发言阶段里该座位有权使用的声明 key */
function allowedDeclarations(env: ExecEnv, phase: Phase, seat: Seat): string[] {
  if (phase.kind !== 'speak') return [];
  const ctx = env.ctx();
  return Object.entries(phase.declarations ?? {}).filter(([, declaration]) => declaration.allowed(ctx, seat)).map(([key]) => key);
}

function legalChaosOutput(game: CompiledGame, snapshot: EngineSnapshot, request: AiRequest, pending: PendingRequest, rng: Rng): unknown {
  const env = new ExecEnv(game, snapshot, { log: [], stageEvents: [], aiRequests: [] });
  const phase = env.phase();
  const legal = pending.legalTargets ?? [];
  switch (phase.kind) {
    case 'vote':
      if (phase.allowAbstain && rng.next() < CHAOS_RATES.abstain) return { target: null };
      return { target: rng.pick(legal) };
    case 'act':
      if (phase.allowNone && rng.next() < CHAOS_RATES.decline) return { targets: [] };
      return { targets: rng.shuffle(legal).slice(0, Math.min(phase.count ?? 1, legal.length)) };
    case 'speak': {
      const scripted = scriptedOutput(game, snapshot, request);
      const declarations = allowedDeclarations(env, phase, env.seat(pending.seat));
      if (declarations.length === 0 || rng.next() >= CHAOS_RATES.declare) return scripted;
      return { ...(scripted as Record<string, unknown>), declare: rng.pick(declarations) };
    }
    default:
      return scriptedOutput(game, snapshot, request);
  }
}

/** 混沌模式下对一条 AI 请求的回复：可能是传输失败、不合法输出，或带有弃票 / 放弃 / 声明的合法输出 */
export function chaosReply(game: CompiledGame, snapshot: EngineSnapshot, request: AiRequest): ScriptedReply {
  const pending = snapshot.pending.find((item) => item.id === request.id);
  if (!pending) throw new EngineInputError(`快照中没有 AI 请求 ${request.id}`);
  const env = new ExecEnv(game, snapshot, { log: [], stageEvents: [], aiRequests: [] });
  const rng = env.ctx().random(`chaos:${request.id}`);
  if (rng.next() < CHAOS_RATES.failed) return { failed: CHAOS_FAILURE_REASON };
  if (rng.next() < CHAOS_RATES.invalid) return { output: invalidOutput(env.phase()) };
  return { output: legalChaosOutput(game, snapshot, request, pending, rng) };
}
