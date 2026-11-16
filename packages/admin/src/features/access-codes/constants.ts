import type { AccessCodeStatus } from '@battle/shared';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** 有效期快捷选项（天） */
export const VALIDITY_PRESETS = [7, 30, 90, 365] as const;
export const DEFAULT_VALIDITY_DAYS = 30;
/** 与服务端上限一致 */
export const MAX_VALIDITY_DAYS = 366;

export const STATUS_LABELS: Readonly<Record<AccessCodeStatus, { readonly label: string; readonly color: string }>> = {
  active: { label: '可用', color: 'green' },
  exhausted: { label: '局数已用完', color: 'orange' },
  expired: { label: '已过期', color: 'red' },
  disabled: { label: '已停用', color: 'default' },
};
