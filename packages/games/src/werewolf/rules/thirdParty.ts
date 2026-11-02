import type { Seat } from '@battle/engine';
import type { ThirdParty } from '../stateExtended';
import type { WerewolfContext } from './context';

// 第三方阵营（state.thirdParty）：人狼恋的丘比特与情侣、魅魔与情侣、鬼魂新娘与新郎和证婚人（lovers），成为第三方的祈求者（requester）。
// 第三方仍在争胜（还有存活的核心成员）时：第三方成员不计入好人与狼人之间的胜负（屠边、票数），好人与狼人都不能获胜；
// 存活玩家全部属于第三方时第三方获胜（屠城）。第三方成员的座位阵营（team）不一定改变：魅魔、人狼恋中的狼仍在狼队里。
// 第三方的夜间击杀在 special/thirdPartyKill.ts。

export type ThirdPartyKind = ThirdParty['kind'];

export function inThirdParty(ctx: WerewolfContext, seat: number): boolean {
  return ctx.state.thirdParty?.seats.includes(seat) ?? false;
}

/** 给定的存活座位中还有第三方的核心成员：第三方仍在争胜 */
function standingAmong(ctx: WerewolfContext, seats: readonly Seat[]): boolean {
  const third = ctx.state.thirdParty;
  return third !== null && seats.some((seat) => third.core.includes(seat.seat));
}

/** 参与好人与狼人胜负的座位：第三方仍在争胜时不含第三方成员；核心成员全部出局后，剩下的成员按普通座位计 */
export function contenders(ctx: WerewolfContext, seats: readonly Seat[]): Seat[] {
  return standingAmong(ctx, seats) ? seats.filter((seat) => !inThirdParty(ctx, seat.seat)) : [...seats];
}

/** 存活玩家全部属于第三方（且核心成员还在）：第三方屠城获胜 */
export function thirdPartyWinner(ctx: WerewolfContext): ThirdPartyKind | null {
  const third = ctx.state.thirdParty;
  if (!third) return null;
  const alive = ctx.seats.alive().list();
  return standingAmong(ctx, alive) && alive.every((seat) => third.seats.includes(seat.seat)) ? third.kind : null;
}

/** 第三方仍在争胜：还有存活的核心成员 */
export function thirdPartyStanding(ctx: WerewolfContext): boolean {
  return standingAmong(ctx, ctx.seats.alive().list());
}
