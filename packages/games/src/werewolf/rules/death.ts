import type { ActDecision, ComputeOutcome, TriggerEvent } from '@battle/engine';
import type { WerewolfState } from '../state';
import type { WerewolfContext } from './context';

/** 猎人枪杀的 cause 记录开枪时机：白天被放逐后开枪 / 夜里死亡后开枪 */
export const SHOT_BY_DAY = 'shot_by_day';
export const SHOT_BY_NIGHT = 'shot_by_night';

/**
 * 遗言：被放逐者、白天被猎人带走者有遗言；夜间死亡（含随之被枪杀者）只有首夜有遗言；自爆者没有遗言。
 */
export function hasLastWords(ctx: WerewolfContext, event: TriggerEvent): boolean {
  if (event.kind !== 'seat_eliminated') return false;
  if (event.cause === 'exile' || event.cause === SHOT_BY_DAY) return true;
  return ctx.round === 1 && ['wolf', 'poison', SHOT_BY_NIGHT].includes(event.cause);
}

/** 猎人被毒杀或自爆（不可能）以外的出局都能开枪 */
export function canHunterShoot(ctx: WerewolfContext, event: TriggerEvent): boolean {
  return event.kind === 'seat_eliminated' && ctx.seats.get(event.seat).role === 'hunter' && event.cause !== 'poison';
}

export function isSheriffDeath(ctx: WerewolfContext, event: TriggerEvent): boolean {
  return event.kind === 'seat_eliminated' && event.seat === ctx.state.sheriff;
}

export function triggerSeat(ctx: WerewolfContext): number[] {
  return ctx.trigger ? [ctx.trigger.seat] : [];
}

export function recordShot(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  return { ...ctx.state, pendingShot: decisions.flatMap((decision) => decision.targets)[0] ?? null };
}

export function describeShot(_ctx: WerewolfContext, _seat: unknown, targets: readonly number[]): string {
  const [target] = targets;
  return target === undefined ? '猎人放弃开枪' : `猎人开枪带走 ${target}号`;
}

export function resolveShot(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const target = ctx.state.pendingShot;
  const state = { ...ctx.state, pendingShot: null };
  if (target === null) return { state };
  const cause = ctx.trigger?.kind === 'seat_eliminated' && ctx.trigger.cause === 'exile' ? SHOT_BY_DAY : SHOT_BY_NIGHT;
  return { state, eliminate: [{ seat: target, reason: '被猎人带走', cause }] };
}

/** 自爆：狼人出局，当天放逐取消，直接入夜 */
export function resolveSelfDestruct(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const seat = ctx.trigger?.seat;
  if (seat === undefined) return {};
  return {
    log: [{ kind: 'narration', text: `${seat}号狼人自爆，今天的放逐投票取消，直接进入黑夜。` }],
    eliminate: [{ seat, reason: '自爆', cause: 'self_destruct' }],
  };
}
