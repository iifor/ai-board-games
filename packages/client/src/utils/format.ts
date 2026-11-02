import type { MatchSummaryDto } from '@battle/shared';

/** "游戏 · 板子"；没有板子时只有游戏名 */
export function formatMatchTitle(match: Pick<MatchSummaryDto, 'gameTitle' | 'variantName'>): string {
  return match.variantName ? `${match.gameTitle} · ${match.variantName}` : match.gameTitle;
}

/** 胜方；没有结果（未结束或失败）时为"未分胜负" */
export function formatWinner(match: Pick<MatchSummaryDto, 'result'>): string {
  return match.result?.winnerLabel ?? '未分胜负';
}

/** 全站统一的日期时间格式：zh-CN、24 小时制 */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}
