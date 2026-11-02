import type { GameCatalogItem, GameVariantItem, MatchSummaryDto } from '@battle/shared';
import type { SetupInitial } from './types';

export function playerRange(game: GameCatalogItem, variantKey: string | null): { min: number; max: number } {
  return game.variants.find((variant) => variant.key === variantKey)?.players ?? game.players;
}

export function selectionHint(count: number, range: { min: number; max: number }): string | null {
  if (count < range.min) return `还需选择 ${range.min - count} 名玩家`;
  if (count > range.max) return `最多 ${range.max} 名玩家，请取消 ${count - range.max} 名`;
  return null;
}

/** 按顺序切换选中；选中顺序即座位顺序 */
export function toggleSelection(selected: readonly number[], id: number): number[] {
  return selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
}

/** 板子搜索：匹配名称、说明或任一角色名 */
export function filterVariants(variants: readonly GameVariantItem[], query: string): GameVariantItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...variants];
  return variants.filter((variant) =>
    [variant.name, variant.description, ...variant.roles.map((role) => role.name)].some((text) => text.toLowerCase().includes(needle)));
}

/** 终局"同样阵容再来一局"带给开局页的路由 state：同一板子 + 同样的玩家（按座位顺序，没有玩家 ID 的座位略过） */
export function rematchStateOf(summary: MatchSummaryDto): SetupInitial {
  return { variant: summary.variantKey, playerIds: summary.seats.flatMap((seat) => (seat.playerId === null ? [] : [seat.playerId])) };
}

export function isSetupInitial(value: unknown): value is SetupInitial {
  if (!value || typeof value !== 'object') return false;
  const record = value as { variant?: unknown; playerIds?: unknown };
  const variantOk = record.variant === undefined || record.variant === null || typeof record.variant === 'string';
  const idsOk = record.playerIds === undefined || (Array.isArray(record.playerIds) && record.playerIds.every((id) => typeof id === 'number'));
  return variantOk && idsOk && (record.variant !== undefined || record.playerIds !== undefined);
}
