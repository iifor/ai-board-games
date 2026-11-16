import { ACCESS_STORAGE_KEY } from '../constants';
import type { StoredAccess } from '../types';

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** 隐私模式或禁用站点数据时 localStorage 可能不可用：读写失败只当作没有保存 */
function defaultStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isStoredAccess(value: unknown): value is StoredAccess {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.token === 'string' && typeof record.tokenExpiresAt === 'string' && typeof record.username === 'string'
    && typeof record.expiresAt === 'string' && (record.remainingMatches === null || typeof record.remainingMatches === 'number');
}

/** 读取未过期的凭证；损坏或已过期的记录顺带清除 */
export function readAccess(now = Date.now(), storage = defaultStorage()): StoredAccess | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(ACCESS_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isStoredAccess(parsed) && Date.parse(parsed.tokenExpiresAt) > now) return parsed;
    storage.removeItem(ACCESS_STORAGE_KEY);
  } catch {
    // 读不到或不是合法 JSON：当作没有凭证
  }
  return null;
}

export function writeAccess(access: StoredAccess, storage = defaultStorage()): void {
  try {
    storage?.setItem(ACCESS_STORAGE_KEY, JSON.stringify(access));
  } catch {
    // 存不下时本次会话仍可用，下次进入需要重新输入
  }
}

export function clearAccess(storage = defaultStorage()): void {
  try {
    storage?.removeItem(ACCESS_STORAGE_KEY);
  } catch {
    // 同上
  }
}
