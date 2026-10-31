import type { ActDecision, ComputeOutcome, Seat, TriggerEvent } from '@battle/engine';
import { NIGHT_DEATH_CAUSES, type WerewolfState } from '../state';
import { roleTraits } from './board';
import { shotBlockedTonight } from './block';
import { isWolf, type WerewolfContext } from './context';

/** 猎人枪杀的 cause 记录开枪时机：白天被放逐后开枪 / 夜里死亡后开枪 */
export const SHOT_BY_DAY = 'shot_by_day';
export const SHOT_BY_NIGHT = 'shot_by_night';
/** 白天随狼美人殉情（夜里的殉情使用夜间死亡原因 charm） */
export const CHARM_BY_DAY = 'charm_day';

/** 因这些原因出局的猎人不能开枪：被毒杀、殉情 */
const NO_SHOT_CAUSES: ReadonlySet<string> = new Set(['poison', 'charm', CHARM_BY_DAY]);

/** 白天出局且有遗言的原因 */
const DAY_LAST_WORDS: ReadonlySet<string> = new Set(['exile', SHOT_BY_DAY]);

/**
 * 遗言：被放逐者、白天被猎人带走者有遗言；夜间死亡（含随之被枪杀者）只有首夜有遗言；
 * 自爆、被白狼王带走、骑士决斗出局、白天殉情者没有遗言。
 */
export function hasLastWords(ctx: WerewolfContext, event: TriggerEvent): boolean {
  if (event.kind !== 'seat_eliminated') return false;
  if (DAY_LAST_WORDS.has(event.cause)) return true;
  return ctx.round === 1 && (NIGHT_DEATH_CAUSES.has(event.cause) || event.cause === SHOT_BY_NIGHT);
}

/** 只有存活的狼人能自爆，部分特殊狼人不能自爆 */
export function canSelfDestruct(seat: Seat): boolean {
  return isWolf(seat) && seat.alive && !roleTraits(seat).noSelfDestruct;
}

/** 猎人被毒杀、殉情以外的出局都能开枪；被梦魇恐惧的当晚被狼刀也不能开枪 */
export function canHunterShoot(ctx: WerewolfContext, event: TriggerEvent): boolean {
  if (event.kind !== 'seat_eliminated' || ctx.seats.get(event.seat).role !== 'hunter') return false;
  if (event.cause === 'wolf' && shotBlockedTonight(ctx, event.seat)) return false;
  return !NO_SHOT_CAUSES.has(event.cause);
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
  // 猎人在夜里死亡（天亮出局）时开的枪算夜间开枪，其余（放逐、白天被带走等）算白天开枪
  const cause = ctx.trigger?.kind === 'seat_eliminated' && NIGHT_DEATH_CAUSES.has(ctx.trigger.cause) ? SHOT_BY_NIGHT : SHOT_BY_DAY;
  if (cause === SHOT_BY_NIGHT && roleTraits(ctx.seats.get(target)).nightShotImmune) {
    return { state, log: [{ kind: 'narration', text: `${target}号中枪后没有出局。` }] };
  }
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
