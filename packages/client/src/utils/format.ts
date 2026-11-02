import type { MatchSummaryDto } from '@battle/shared';

// 对局标题（"游戏 · 板子"）用 @battle/shared 的 formatMatchTitle，C 端与 B 端共用

/** 胜方；没有结果（未结束或失败）时为"未分胜负" */
export function formatWinner(match: Pick<MatchSummaryDto, 'result'>): string {
  return match.result?.winnerLabel ?? '未分胜负';
}

/** 全站统一的日期时间格式：zh-CN、24 小时制 */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}
