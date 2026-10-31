import type { DealContext, SeatQuery } from '@battle/engine';
import type { BoardDefinition } from '../boardDefinition';
import { DEFAULT_BOARD, findBoard } from '../boards';
import { roleCatalog } from '../roles';
import type { WerewolfParams, WerewolfState } from '../state';

// 有底牌的板子（盗贼）：牌堆 = roles + extraCards，开局按种子抽出与 extraCards 同样数量的底牌，其余发给座位。

type Assignment = Readonly<Record<string, number | 'rest'>>;

/** 把角色表展开成牌堆（rest 承接剩余座位） */
function deckOf(board: BoardDefinition, seats: number): string[] {
  const entries = Object.entries(board.roles);
  const fixed = entries.reduce((sum, [, count]) => sum + (count === 'rest' ? 0 : count), 0);
  const cards = entries.flatMap(([role, count]) => Array.from({ length: count === 'rest' ? seats - fixed : count }, () => role));
  return [...cards, ...Object.entries(board.extraCards ?? {}).flatMap(([role, count]) => Array.from({ length: count }, () => role))];
}

/** 狼人阵营的牌（盗贼抽到时必须拿走） */
export function isWolfCard(role: string): boolean {
  const team = roleCatalog()[role]?.spec.team;
  return team === 'werewolf' || team === 'lone_wolf';
}

/**
 * 底牌不能是（狼人，狼人）、（狼王，狼人）、（盗贼，狼王）、（盗贼，狼人）：
 * 最多一张狼人阵营的牌，抽出狼人阵营的牌时盗贼必须在场（由他拿走）。
 */
export function extrasAllowed(cards: readonly string[]): boolean {
  const wolves = cards.filter(isWolfCard).length;
  return wolves === 0 || (wolves === 1 && !cards.includes('thief'));
}

/** 从 n 张牌中取 k 张的全部下标组合（k 很小） */
function combinations(n: number, k: number, start = 0): number[][] {
  if (k === 0) return [[]];
  const result: number[][] = [];
  for (let index = start; index <= n - k; index += 1) {
    for (const rest of combinations(n, k - 1, index + 1)) result.push([index, ...rest]);
  }
  return result;
}

function countRoles(cards: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const card of cards) counts[card] = (counts[card] ?? 0) + 1;
  return counts;
}

/** setup.deal：没有底牌的板子沿用默认分配；有底牌时在允许的组合中按种子均匀抽取 */
export function dealBoard(ctx: DealContext<WerewolfParams>): Assignment {
  const board = findBoard(ctx.variant?.key ?? DEFAULT_BOARD);
  if (!board.extraCards) return ctx.assign;
  const deck = deckOf(board, ctx.playerCount);
  const draws = Object.values(board.extraCards).reduce((sum, count) => sum + count, 0);
  const allowed = combinations(deck.length, draws).filter((picks) => extrasAllowed(picks.map((index) => deck[index] ?? '')));
  const picks = new Set(allowed[ctx.random('extra-cards').int(allowed.length)] ?? []);
  return countRoles(deck.filter((_, index) => !picks.has(index)));
}

/** 开局时由牌堆与实际发出的座位反推底牌（按牌堆顺序），写入盗贼的状态 */
export function initialThief(board: BoardDefinition, seats: SeatQuery): WerewolfState['thief'] {
  if (!board.extraCards) return null;
  const remaining = countRoles(seats.list().map((seat) => seat.role));
  const cards: string[] = [];
  for (const role of deckOf(board, seats.count())) {
    if ((remaining[role] ?? 0) > 0) remaining[role] = (remaining[role] ?? 0) - 1;
    else cards.push(role);
  }
  const label = (role: string | undefined): string => (role === undefined ? '' : `「${roleCatalog()[role]?.spec.name ?? role}」`);
  return { seat: seats.withRole('thief').ids()[0] ?? null, cards, first: label(cards[0]), second: label(cards[1]) };
}
