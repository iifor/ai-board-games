import type { Seat } from '@battle/engine';
import { boardConfigSchema, type BoardConfig, type RoleCategory } from '../boardDefinition';
import { DEFAULT_BOARD, findBoard } from '../boards';
import { ROLE_CATALOG, type RoleTraits } from '../roles';
import type { WerewolfContext } from './context';

const parsedConfigs = new Map<string, BoardConfig>();

/** 板子参数是静态的，按板子缓存解析结果（胜负判定等热点每个阶段都会读取） */
export function boardConfig(ctx: Pick<WerewolfContext, 'variant'>): BoardConfig {
  const key = ctx.variant?.key ?? '';
  const cached = parsedConfigs.get(key);
  if (cached) return cached;
  const parsed = boardConfigSchema.parse(ctx.variant?.config ?? {});
  parsedConfigs.set(key, parsed);
  return parsed;
}

const decks = new Map<string, ReadonlySet<string>>();

/** 本局牌堆里的角色（含盗贼板子被抽作底牌的牌）：公开信息 */
function deckRoles(ctx: Pick<WerewolfContext, 'variant'>): ReadonlySet<string> {
  const key = ctx.variant?.key ?? DEFAULT_BOARD;
  const cached = decks.get(key);
  if (cached) return cached;
  const board = findBoard(key);
  const roles = new Set([...Object.keys(board.roles), ...Object.keys(board.extraCards ?? {})]);
  decks.set(key, roles);
  return roles;
}

/**
 * 本局是否有该角色（不论存活）：牌堆里有这张牌，或有座位中途变成了该角色。
 * 只依据公开信息——盗贼板子里被抽作底牌的角色也算"有"，否则有标题的阶段是否出现会暴露底牌。
 */
export function hasRole(ctx: WerewolfContext, role: string): boolean {
  return deckRoles(ctx).has(role) || ctx.seats.withRole(role).count() > 0;
}

export function roleCategory(ctx: WerewolfContext, seat: Seat): RoleCategory {
  return boardConfig(ctx).categories[seat.role] ?? ROLE_CATALOG[seat.role]?.category ?? 'villager';
}

export function roleTraits(seat: Seat): RoleTraits {
  return ROLE_CATALOG[seat.role]?.traits ?? {};
}
