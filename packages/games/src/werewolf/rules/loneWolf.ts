import type { SeatQuery } from '@battle/engine';
import type { BoardConfig } from '../boardDefinition';
import { roleTraits } from './board';
import { isPackWolf, LONE_WOLF_TEAM } from './context';

/**
 * 离群的狼与狼队之间的相识关系，开局确定后写入 state.knownWolves（每人只看到自己那一项）：
 * - 狼队认识的离群狼（大灰狼）：与狼队互相认识；
 * - 狼队不认识的离群狼（隐狼）：hiddenWolf 为 inherit 的板子由法官私下告知其狼同伴，linked 的板子互不相认；
 * - 只与某个角色相认的离群狼（特性 pairedWith，如狼弟与狼兄）：只与该角色互相认识。
 */
export function initialKnownWolves(seats: SeatQuery, config: BoardConfig): Record<string, number[]> {
  const pack = seats.where(isPackWolf).ids();
  const known: Record<string, number[]> = {};
  const meet = (seat: number, others: readonly number[]): void => {
    if (others.length) known[String(seat)] = [...(known[String(seat)] ?? []), ...others];
  };
  const visibleToPack: number[] = [];
  for (const seat of seats.where((item) => item.team === LONE_WOLF_TEAM).list()) {
    const traits = roleTraits(seat);
    if (traits.pairedWith !== undefined) {
      const partners = seats.withRole(traits.pairedWith).ids();
      meet(seat.seat, partners);
      for (const partner of partners) meet(partner, [seat.seat]);
      continue;
    }
    const hidden = Boolean(traits.hiddenFromPack);
    if (!hidden) visibleToPack.push(seat.seat);
    if (!hidden || config.hiddenWolf === 'inherit') meet(seat.seat, pack);
  }
  for (const wolf of pack) meet(wolf, visibleToPack);
  return known;
}
