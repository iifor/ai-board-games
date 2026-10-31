import type { Seat } from '@battle/engine';
import { roleTraits } from './board';
import { isWolf, type WerewolfContext } from './context';

/** 查验（预言家、幸运儿、狐狸、熊的咆哮）时是否被视为好人：隐狼始终如此；狼弟在狼兄出局前如此 */
export function appearsGood(ctx: WerewolfContext, seat: Seat): boolean {
  const traits = roleTraits(seat);
  if (traits.appearsGood) return true;
  return traits.appearsGoodWhile !== undefined && ctx.seats.alive().withRole(traits.appearsGoodWhile).count() > 0;
}

/** 查验结果为狼人：狼人阵营且没有被视为好人 */
export function checksAsWolf(ctx: WerewolfContext, seat: Seat): boolean {
  return isWolf(seat) && !appearsGood(ctx, seat);
}
