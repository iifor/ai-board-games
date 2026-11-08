import type { GameCatalogItem, GameVariantItem, MatchSummaryDto, VariantRoleItem } from '@battle/shared';
import type { PlayerRange, SetupInitial } from './types';

export function playerRange(game: GameCatalogItem, variantKey: string | null): PlayerRange {
  return game.variants.find((variant) => variant.key === variantKey)?.players ?? game.players;
}

/** 人数不满足时的提示；满足时为 null */
export function selectionHint(count: number, range: PlayerRange): string | null {
  if (count < range.min) return `还需选择 ${range.min - count} 名玩家`;
  if (count > range.max) return `最多 ${range.max} 名玩家，请取消 ${count - range.max} 名`;
  return null;
}

/** 人数已满足时的提示：只有到了上限才说"人数已满"，否则说明还能再加几人 */
export function readyLabel(count: number, range: PlayerRange): string {
  if (count >= range.max) return '人数已满，可以开始';
  return `可开局，还可再加 ${range.max - count} 人`;
}

/** 按顺序切换选中；选中顺序即座位顺序 */
export function toggleSelection(selected: readonly number[], id: number): number[] {
  return selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
}

export function debatePosition(group: VariantRoleItem | undefined, offset: number): string {
  if (group?.team !== 'pro' && group?.team !== 'con') return '';
  return `${['一', '二', '三', '四'][offset] ?? offset + 1}辩`;
}

/** 从候选列表中选出空位所需的玩家；已有座位不参与重排。 */
export function fillOpenSeats(candidates: readonly number[], selected: readonly number[], max: number, randomize: boolean): number[] {
  const pool = candidates.filter((id) => !selected.includes(id));
  if (randomize) {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
  }
  return pool.slice(0, Math.max(0, max - selected.length));
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
