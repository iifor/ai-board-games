// 对局标题（"游戏 · 板子"）用 @battle/shared 的 formatMatchTitle，C 端与 B 端共用

/** 后台统一的日期时间格式：zh-CN、24 小时制；空值显示为空 */
export function formatTime(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString('zh-CN', { hour12: false }) : '';
}
