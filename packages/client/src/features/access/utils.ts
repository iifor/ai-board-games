import type { StoredAccess } from './types';

/** 持有人提示：用户名 + 剩余局数；不限局数时只显示用户名 */
export function accessSummary(access: Pick<StoredAccess, 'username' | 'remainingMatches'>): string {
  return access.remainingMatches === null ? access.username : `${access.username} · 剩余 ${access.remainingMatches} 局`;
}
