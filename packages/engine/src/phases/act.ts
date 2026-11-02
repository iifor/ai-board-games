import { z } from 'zod';
import type { ExecEnv } from '../runtime/env';
import { toSeatNumbers } from '../runtime/seats';
import type { PendingRequest } from '../runtime/types';
import type { ActDecision } from '../spec/context';
import type { ActPhase } from '../spec/phases';
import { privateChannel } from '../visibility/channels';
import { seatNumber } from './seatNumber';
import { done, issue, type AiPhaseExecutor } from './types';

interface ActState {
  readonly actors: number[];
  readonly legal: Record<string, number[]>;
  readonly decisions: Record<string, number[]>;
  issued: boolean;
}

interface ActOutput {
  readonly targets: number[];
}

type Phase = ActPhase<unknown, unknown>;

function targetCount(phase: Phase, pending: PendingRequest): number {
  return Math.min(phase.count ?? 1, pending.legalTargets?.length ?? 0);
}

function complete(env: ExecEnv, phase: Phase) {
  const state = env.phaseState<ActState>();
  const decisions: ActDecision[] = state.actors
    .filter((seat) => state.decisions[String(seat)])
    .map((seat) => ({ seat, targets: state.decisions[String(seat)] ?? [] }));
  const result = { kind: 'act', decisions } as const;
  if (phase.apply) env.setState(phase.apply(env.ctx(result), decisions));
  return done(result);
}

export const actExecutor: AiPhaseExecutor<Phase> = {
  enter(env, phase) {
    const ctx = env.ctx();
    const actors = toSeatNumbers(phase.actors(ctx));
    const legal = Object.fromEntries(actors.map((seat) => [String(seat), toSeatNumbers(phase.targets(ctx, env.seat(seat)))]));
    env.setPhaseState<ActState>({ actors, legal, decisions: {}, issued: false });
  },

  step(env, phase) {
    const state = env.phaseState<ActState>();
    if (state.issued) return complete(env, phase);
    state.issued = true;
    const drafts = state.actors
      .filter((seat) => (state.legal[String(seat)] ?? []).length > 0)
      .map((seat) => ({
        slot: `s${seat}`,
        seat,
        action: 'act' as const,
        template: phase.prompt,
        vars: {},
        legalTargets: state.legal[String(seat)] ?? [],
      }));
    return drafts.length ? issue(drafts) : complete(env, phase);
  },

  schema(_env, phase, pending) {
    const count = targetCount(phase, pending);
    const targets = phase.allowNone
      ? z.array(seatNumber()).max(count)
        .refine((list) => list.length === 0 || list.length === count, `只能选择 ${count} 个目标，或输出空数组表示放弃`)
        .describe(`${phase.action}的目标座位号；输出空数组表示放弃`)
      : z.array(seatNumber()).length(count).describe(`${phase.action}的目标座位号`);
    return z.object({ targets, reason: z.string().max(300).optional().describe('简短理由') });
  },

  check(_env, _phase, pending, value) {
    const { targets } = value as ActOutput;
    const legal = pending.legalTargets ?? [];
    if (new Set(targets).size !== targets.length) return '目标不能重复';
    const illegal = targets.filter((target) => !legal.includes(target));
    return illegal.length ? `${illegal.join('、')} 不是合法目标` : null;
  },

  fallback(env, phase, pending) {
    const mode = phase.fallbackMode ?? (phase.allowNone ? 'none' : 'random');
    if (mode === 'none') {
      if (!phase.allowNone) throw new Error(`阶段 ${env.phaseId()} 不允许放弃，fallbackMode 不能为 none`);
      return { targets: [] };
    }
    const rng = env.ctx().random(`fallback:${pending.id}`);
    return { targets: rng.shuffle(pending.legalTargets ?? []).slice(0, targetCount(phase, pending)) };
  },

  store(env, phase, pending, value) {
    const state = env.phaseState<ActState>();
    const seat = env.seat(pending.seat);
    const { targets } = value as ActOutput;
    state.decisions[String(seat.seat)] = targets;
    const ctx = env.ctx();
    const fallbackText = targets.length
      ? `${phase.action}：${targets.map((target) => `${target}号`).join('、')}`
      : `放弃${phase.action}`;
    const text = phase.describe?.(ctx, seat, targets) ?? fallbackText;
    env.log({
      kind: 'action',
      seat: seat.seat,
      action: phase.action,
      targets,
      text,
      channel: phase.channel?.(ctx, seat) ?? privateChannel(seat.seat),
    });
  },
};
