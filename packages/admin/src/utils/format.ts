import type { MatchSummaryDto } from '@battle/shared';

/** 后台统一的日期时间格式：zh-CN、24 小时制；空值显示为空 */
export function formatTime(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString('zh-CN', { hour12: false }) : '';
}

/** "游戏 · 板子"；没有板子时只有游戏名 */
export function formatMatchTitle(match: Pick<MatchSummaryDto, 'gameTitle' | 'variantName'>): string {
  return match.variantName ? `${match.gameTitle} · ${match.variantName}` : match.gameTitle;
}
