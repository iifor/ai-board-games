import type { MatchSummaryDto } from './api/matches';

/** 对局标题："游戏 · 板子"，没有板子时只有游戏名；C 端与 B 端共用 */
export function formatMatchTitle(match: Pick<MatchSummaryDto, 'gameTitle' | 'variantName'>): string {
  return match.variantName ? `${match.gameTitle} · ${match.variantName}` : match.gameTitle;
}
