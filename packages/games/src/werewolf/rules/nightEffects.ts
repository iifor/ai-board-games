import type { WerewolfContext } from './context';

// 夜间状态的解读，供结算、合法目标与查验共用：魔术师换号、占卜师标记、摄梦人的梦游者。
// 写入这些状态的阶段在对应的特殊角色模块中（special/magician.ts、fortuneTeller.ts、dreamer.ts）。

/** 魔术师当晚交换了号码时，作用在 seat 上的技能实际落在谁身上（没有交换则原样返回） */
export function swapTarget(ctx: WerewolfContext, seat: number): number {
  const swapped = ctx.state.night.swapped;
  if (swapped === null) return seat;
  const [first, second] = swapped;
  if (seat === first) return second;
  return seat === second ? first : seat;
}

/** 占卜师的标记范围：被标记的号码与左右相邻号码（不论死活）；今晚没有标记时为 null */
export function markScope(ctx: WerewolfContext): number[] | null {
  const { marked } = ctx.state.night;
  if (marked === null) return null;
  const total = ctx.seats.count();
  const wrap = (seat: number): number => ((seat - 1 + total) % total) + 1;
  return [wrap(marked - 1), marked, wrap(marked + 1)];
}

/** 狼人今晚能否击杀该座位（只看占卜师的标记范围） */
export function withinMark(ctx: WerewolfContext, seat: number): boolean {
  const scope = markScope(ctx);
  return scope === null || scope.includes(seat);
}

/** 今晚的梦游者（被摄梦人摄梦）：狼刀视为空刀，毒药、解药浪费 */
export function isDreamed(ctx: WerewolfContext, seat: number): boolean {
  return ctx.state.night.dreamed === seat;
}
