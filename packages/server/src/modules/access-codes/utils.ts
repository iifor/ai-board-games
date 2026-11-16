import { createHash, randomInt } from 'node:crypto';
import type { AccessCodeDto, AccessCodeStatus } from '@battle/shared';
import { CODE_ALPHABET, CODE_GROUP_SIZE, CODE_HINT_LENGTH, CODE_LENGTH } from './constants';
import type { AccessCodeRow } from './types';

/** 生成明文码，如 `K7QX-M2PA-9RTC-HW4N` */
export function generateCode(): string {
  const chars = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]!);
  const groups: string[] = [];
  for (let index = 0; index < chars.length; index += CODE_GROUP_SIZE) groups.push(chars.slice(index, index + CODE_GROUP_SIZE).join(''));
  return groups.join('-');
}

/** 用户输入可能带空格、连字符或小写：统一成只含字符集字符的大写串 */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

/** 码本身有足够熵，直接用 SHA-256 存储即可抵御离线穷举 */
export function hashCode(normalized: string): string {
  return createHash('sha256').update(normalized).digest('hex');
}

export function codeHint(normalized: string): string {
  return normalized.slice(-CODE_HINT_LENGTH);
}

export function remainingMatches(row: Pick<AccessCodeRow, 'maxMatches' | 'usedMatches'>): number | null {
  return row.maxMatches === null ? null : Math.max(0, row.maxMatches - row.usedMatches);
}

/** 停用优先于过期，过期优先于用完 */
export function statusOf(row: Pick<AccessCodeRow, 'disabled' | 'expiresAt' | 'maxMatches' | 'usedMatches'>, now: number): AccessCodeStatus {
  if (row.disabled) return 'disabled';
  if (row.expiresAt.getTime() <= now) return 'expired';
  if (remainingMatches(row) === 0) return 'exhausted';
  return 'active';
}

export function toDto(row: AccessCodeRow, now: number): AccessCodeDto {
  return {
    id: row.id,
    username: row.username,
    codeHint: row.codeHint,
    expiresAt: row.expiresAt.toISOString(),
    maxMatches: row.maxMatches,
    usedMatches: row.usedMatches,
    disabled: row.disabled,
    status: statusOf(row, now),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
