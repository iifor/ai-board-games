import type { Seat } from '@battle/engine';
import { boardConfigSchema, type BoardConfig, type RoleCategory } from '../boards';
import { ROLE_CATALOG } from '../roles';
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

/** 本局是否有该角色（不论存活） */
export function hasRole(ctx: WerewolfContext, role: string): boolean {
  return ctx.seats.withRole(role).count() > 0;
}

export function roleCategory(ctx: WerewolfContext, seat: Seat): RoleCategory {
  return boardConfig(ctx).categories[seat.role] ?? ROLE_CATALOG[seat.role]?.category ?? 'villager';
}
