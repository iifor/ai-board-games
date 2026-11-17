import { systemChoiceLabel, type SystemChoice } from '@battle/shared';
import { z } from 'zod';
import type { ExecEnv } from '../runtime/env';
import { toSeatNumbers } from '../runtime/seats';
import type { PendingRequest } from '../runtime/types';
import type { ActDecision } from '../spec/context';
import type { ActPhase } from '../spec/phases';
import { privateChannel } from '../visibility/channels';
import { asideField, logAside } from './aside';
import { seatNumber } from './seatNumber';
import { done, issue, type AiPhaseExecutor, type RequestDraft } from './types';

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
    const drafts: RequestDraft[] = [];
    for (const seat of state.actors) {
      const legalTargets = state.legal[String(seat)] ?? [];
      if (!legalTargets.length) continue;
      if (legalTargets.length === 1 && !phase.allowNone) {
        storeDecision(env, phase, seat, legalTargets, 'only_target');
      } else {
        if (phase.decisionNotice) {
          env.log({ kind: 'narration', purpose: 'decision', channel: privateChannel(seat), text: phase.decisionNotice(legalTargets, env.ctx()) });
        }
        drafts.push({ slot: `s${seat}`, seat, action: 'act', template: phase.prompt, vars: {}, legalTargets });
      }
    }
    return drafts.length ? issue(drafts) : complete(env, phase);
  },

  schema(_env, phase, pending) {
    const count = targetCount(phase, pending);
    const targets = phase.allowNone
      ? z.array(seatNumber()).max(count)
        .refine((list) => list.length === 0 || list.length === count, `只能选择 ${count} 个目标，或输出空数组表示放弃`)
        .describe(`${phase.action}的目标座位号；输出空数组表示放弃`)
      : z.array(seatNumber()).length(count).describe(`${phase.action}的目标座位号`);
    const base = z.object({ targets, reason: z.string().max(300).optional().describe('简短理由') });
    return phase.aside ? base.extend({ aside: asideField(phase.aside) }) : base;
  },

  check(_env, _phase, pending, value) {
    const { targets } = value as ActOutput;
    const legal = pending.legalTargets ?? [];
    if (new Set(targets).size !== targets.length) return '目标不能重复';
    const illegal = targets.filter((target) => !legal.includes(target));
    return illegal.length ? `${illegal.join('、')} 不是合法目标` : null;
  },

  skipFailed(env, phase, pending) {
    const seat = env.seat(pending.seat);
    env.log({ kind: 'action', seat: seat.seat, action: phase.action, targets: [], source: 'request_failed',
      channel: phase.channel?.(env.ctx(), seat) ?? privateChannel(seat.seat), text: `请求失败，放弃${phase.action}` });
    // 没有玩家决定。部分玩法把主动提交空数组解释为选择另一个选项。
    return { skipped: true, targets: [] };
  },

  store(env, phase, pending, value) {
    logAside(env, phase.aside, pending, value);
    storeDecision(env, phase, pending.seat, (value as ActOutput).targets);
  },
};

function storeDecision(env: ExecEnv, phase: Phase, seatId: number, targets: number[], source?: SystemChoice) {
  const state = env.phaseState<ActState>();
  const seat = env.seat(seatId);
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
    ...(source && { source }),
    text: source ? `${systemChoiceLabel(source)}：${text}` : text,
    channel: phase.channel?.(ctx, seat) ?? privateChannel(seat.seat),
  });
}
