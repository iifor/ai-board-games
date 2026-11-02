import type { RuleContext, Seat } from '@battle/engine';
import type { WerewolfParams, WerewolfState } from '../state';

export type WerewolfContext = RuleContext<WerewolfState, WerewolfParams>;

/** 与狼队一起夜聊、击杀的狼（共享 team:werewolf 频道） */
export const PACK_TEAM = 'werewolf';
/** 离群的狼（大灰狼、隐狼）：属于狼人阵营，但不在狼队频道里 */
export const LONE_WOLF_TEAM = 'lone_wolf';

/** 狼人阵营（胜负、计票、骑士决斗等都按此判断） */
export function isWolf(seat: Seat): boolean {
  return seat.team === PACK_TEAM || seat.team === LONE_WOLF_TEAM;
}

/** 狼队成员：一起夜聊、击杀，被封锁时整个狼队受影响 */
export function isPackWolf(seat: Seat): boolean {
  return seat.team === PACK_TEAM;
}

/** 翻牌存活、等待出局的魔狼（state.magicWolfDoom）：不能投票；达到天数上限时视为已出局 */
export function bloodlineDoomed(ctx: WerewolfContext, seat: Seat): boolean {
  return seat.role === 'magic_wolf' && ctx.state.magicWolfDoom !== null;
}

/** 翻牌的白痴失去投票权；翻牌存活、等待出局的魔狼也不能投票 */
export function canVote(ctx: WerewolfContext, seat: Seat): boolean {
  if (bloodlineDoomed(ctx, seat)) return false;
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

/** seat 左右两侧最近的、满足 present 的座位（不含自己；只剩一侧时只有一个） */
export function nearestNeighbors(ctx: WerewolfContext, seat: number, present: (seat: number) => boolean): number[] {
  const total = ctx.seats.count();
  const found = ([1, -1] as const).map((step) => {
    for (let offset = 1; offset < total; offset += 1) {
      const candidate = ((((seat - 1 + step * offset) % total) + total) % total) + 1;
      if (present(candidate)) return candidate;
    }
    return undefined;
  });
  return [...new Set(found.filter((item): item is number => item !== undefined))];
}

/** 按座位号环绕的相连号码：center 与左右各 radius 个号码（不论死活） */
export function adjacentSeats(ctx: WerewolfContext, center: number, radius = 1): number[] {
  const total = ctx.seats.count();
  const wrap = (seat: number): number => ((((seat - 1) % total) + total) % total) + 1;
  return [...new Set(Array.from({ length: radius * 2 + 1 }, (_, index) => wrap(center - radius + index)))];
}

/** 按座位号顺时针排列，从种子决定的位置开始 */
export function seededRotation(ctx: WerewolfContext, seats: readonly number[], label: string): number[] {
  const sorted = [...seats].sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const start = ctx.random(label).int(sorted.length);
  return [...sorted.slice(start), ...sorted.slice(0, start)];
}
