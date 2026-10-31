import type { Seat } from '@battle/engine';
import { swapTarget } from '../special/magician';
import type { ThirdParty } from '../stateExtended';
import type { WerewolfContext } from './context';
import { addDeath } from './tally';
import type { NightStep } from './types';

// 第三方阵营（state.thirdParty）：人狼恋的丘比特与情侣、魅魔与情侣、鬼魂新娘与新郎和证婚人（lovers），成为第三方的祈求者（requester）。
// 第三方成员不计入好人与狼人之间的胜负（屠边、票数），第三方还有人存活时好人与狼人都不能获胜；
// 存活玩家全部属于第三方时第三方获胜（屠城）。第三方成员的座位阵营（team）不一定改变：魅魔、人狼恋中的狼仍在狼队里。

export type ThirdPartyKind = ThirdParty['kind'];

export function inThirdParty(ctx: WerewolfContext, seat: number): boolean {
  return ctx.state.thirdParty?.seats.includes(seat) ?? false;
}

/** 参与好人与狼人胜负的座位：不含第三方成员 */
export function contenders(ctx: WerewolfContext, seats: readonly Seat[]): Seat[] {
  return seats.filter((seat) => !inThirdParty(ctx, seat.seat));
}

/** 存活玩家全部属于第三方：第三方屠城获胜 */
export function thirdPartyWinner(ctx: WerewolfContext): ThirdPartyKind | null {
  const third = ctx.state.thirdParty;
  if (!third) return null;
  const alive = ctx.seats.alive().list();
  return alive.length > 0 && alive.every((seat) => third.seats.includes(seat.seat)) ? third.kind : null;
}

/** 还有存活的第三方成员 */
export function thirdPartyStanding(ctx: WerewolfContext): boolean {
  return ctx.seats.alive().where((seat) => inThirdParty(ctx, seat.seat)).count() > 0;
}

/** 第三方的夜间击杀（祈求者、鬼魂新娘一方）：守护、解药都挡不下，女巫不会被告知；魔术师换号后按实际落点 */
export const thirdPartyKill: NightStep = (ctx, tally) => {
  const { thirdKill } = ctx.state.night;
  return thirdKill === null ? tally : addDeath(tally, swapTarget(ctx, thirdKill), 'third_kill');
};
