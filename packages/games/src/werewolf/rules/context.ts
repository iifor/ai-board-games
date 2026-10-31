import type { RuleContext, Seat, SeatQuery } from '@battle/engine';
import { GOD_ROLES, type WerewolfParams, type WerewolfState } from '../state';

export type WerewolfContext = RuleContext<WerewolfState, WerewolfParams>;

export function isWolf(seat: Seat): boolean {
  return seat.team === 'werewolf';
}

export function aliveGods(seats: SeatQuery): SeatQuery {
  return seats.alive().withRole(...GOD_ROLES);
}

/** 翻牌的白痴失去投票权 */
export function canVote(ctx: WerewolfContext, seat: Seat): boolean {
  return seat.alive && !(seat.role === 'idiot' && ctx.state.idiotRevealed);
}

/** 从 start 出发沿座位号方向（+1 顺时针，-1 逆时针）环绕一圈，返回其中存活的座位 */
export function ring(ctx: WerewolfContext, start: number, step: 1 | -1): number[] {
  const total = ctx.seats.count();
  const order: number[] = [];
  for (let offset = 0; offset < total; offset += 1) {
    const seat = ((((start - 1 + step * offset) % total) + total) % total) + 1;
    if (ctx.seats.get(seat).alive) order.push(seat);
  }
  return order;
}

/** 按座位号顺时针排列，从种子决定的位置开始 */
export function seededRotation(ctx: WerewolfContext, seats: readonly number[], label: string): number[] {
  const sorted = [...seats].sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const start = ctx.random(label).int(sorted.length);
  return [...sorted.slice(start), ...sorted.slice(0, start)];
}
