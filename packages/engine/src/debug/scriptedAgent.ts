import type { CompiledGame } from '../compiler/compile';
import { EngineInputError } from '../errors';
import { ExecEnv } from '../runtime/env';
import { phaseTitle, seatLabel } from '../runtime/labels';
import type { AiRequest, EngineSnapshot } from '../runtime/types';
import { cloneJson } from '../utils/json';

/** 调试局的确定性输出：不调用模型，结果只由种子与请求 ID 决定，且一定合法 */
export function scriptedOutput(game: CompiledGame, snapshot: EngineSnapshot, request: AiRequest): unknown {
  const pending = snapshot.pending.find((item) => item.id === request.id);
  if (!pending) throw new EngineInputError(`快照中没有 AI 请求 ${request.id}`);
  const env = new ExecEnv(game, cloneJson(snapshot), { log: [], stageEvents: [], aiRequests: [] });
  const phase = env.phase();
  const seat = env.seat(pending.seat);
  const ctx = env.ctx();
  const rng = ctx.random(`debug:${request.id}`);
  const legal = pending.legalTargets ?? [];

  switch (phase.kind) {
    case 'speak': {
      const scripted = game.spec.debug?.speak?.(ctx, seat, pending.vars)
        ?? { speech: `【调试】${seatLabel(game, seat)}在「${phaseTitle(game, env.phaseId())}」的发言` };
      return phase.output.safeParse(scripted).success ? scripted : phase.fallback(ctx, seat);
    }
    case 'act':
      if (phase.allowNone && rng.next() < 0.5) return { targets: [] };
      return { targets: rng.shuffle(legal).slice(0, Math.min(phase.count ?? 1, legal.length)) };
    case 'vote':
      return { target: rng.pick(legal) };
    case 'judge':
      return { verdict: rng.pick(Object.keys(phase.verdicts)), comment: `【调试】${seatLabel(game, seat)}的点评` };
    default:
      throw new EngineInputError(`阶段 ${pending.phaseId} 不需要 AI 输出`);
  }
}
