import type { AccessCodeDto, AccessCodeInput } from '@battle/shared';
import { DAY_MS, DEFAULT_VALIDITY_DAYS } from './constants';
import type { AccessCodeFormValues } from './types';

export function defaultFormValues(): AccessCodeFormValues {
  return { username: '', validityDays: DEFAULT_VALIDITY_DAYS, limited: false, maxMatches: null, disabled: false };
}

export function formValuesOf(code: AccessCodeDto): AccessCodeFormValues {
  return { username: code.username, validityDays: null, limited: code.maxMatches !== null, maxMatches: code.maxMatches, disabled: code.disabled };
}

/** 表单值转接口入参；编辑时有效期留空则沿用原值 */
export function toInput(values: AccessCodeFormValues, editing: AccessCodeDto | null, now = Date.now()): AccessCodeInput {
  const expiresAt = values.validityDays
    ? new Date(now + values.validityDays * DAY_MS).toISOString()
    : editing?.expiresAt ?? new Date(now + DEFAULT_VALIDITY_DAYS * DAY_MS).toISOString();
  return {
    username: values.username.trim(),
    expiresAt,
    maxMatches: values.limited ? values.maxMatches : null,
    disabled: values.disabled,
  };
}

/** 局数列："已用 / 上限"，不限时只显示已用 */
export function usageLabel(code: Pick<AccessCodeDto, 'usedMatches' | 'maxMatches'>): string {
  return code.maxMatches === null ? `${code.usedMatches} / 不限` : `${code.usedMatches} / ${code.maxMatches}`;
}

/** 发给用户的完整说明：粘贴到聊天里即可 */
export function shareText(username: string, secret: string, expiresAt: string, format: (iso: string) => string): string {
  return `${username}，你的开局身份码：${secret}（有效期至 ${format(expiresAt)}）`;
}

/** 按用户名、尾号关键字和状态筛选 */
export function filterCodes(codes: readonly AccessCodeDto[], query: string | undefined, status: string | undefined): AccessCodeDto[] {
  const keyword = query?.trim().toLowerCase() ?? '';
  return codes.filter((code) => (!status || code.status === status)
    && (!keyword || code.username.toLowerCase().includes(keyword) || code.codeHint.toLowerCase().includes(keyword)));
}
