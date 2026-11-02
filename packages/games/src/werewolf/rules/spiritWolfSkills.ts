import type { Seat } from '@battle/engine';
import { hasRole } from './board';
import type { WerewolfContext } from './context';
import { swapTarget } from './nightEffects';

// 灵狼学到的技能对其他规则的影响（查验结果、毒药、夜间开枪、查验视为好人、预言家的睁眼顺序）。
// 写入这些状态的阶段在 special/spiritWolf.ts。

const SPIRIT_WOLF = 'spirit_wolf';

/** 有灵狼的板子：灵狼在女巫之后、预言家之前睁眼，预言家改在灵狼之后查验（公开信息：按牌堆判断） */
export function seerWakesLate(ctx: WerewolfContext): boolean {
  return hasRole(ctx, SPIRIT_WOLF);
}

/** 该座位今晚被灵狼庇护（魔术师换号后按实际落点）：免疫狼刀、毒药与夜间开枪，预言家查验不出结果 */
export function shieldedTonight(ctx: WerewolfContext, seat: number): boolean {
  const { spiritShield } = ctx.state.night;
  return spiritShield !== null && swapTarget(ctx, spiritShield) === seat;
}

/** 女巫今晚的毒药被灵狼的解毒剂解救（按女巫选择的号码） */
export function antidotedTonight(ctx: WerewolfContext, seat: number): boolean {
  return ctx.state.night.spiritAntidote === seat;
}

/** 学到平民的灵狼：查验视为好人 */
export function spiritAppearsGood(ctx: WerewolfContext, seat: Seat): boolean {
  return seat.role === SPIRIT_WOLF && ctx.state.spiritWolf.learned === 'villager';
}
