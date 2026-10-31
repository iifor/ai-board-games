import type { GameCatalogItem } from '@battle/shared';

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
