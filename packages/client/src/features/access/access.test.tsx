import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SetupActionBar } from '../lobby/components/SetupActionBar';
import { AccessBadge } from './components/AccessBadge';
import { AccessCodeDialog } from './components/AccessCodeDialog';
import { ACCESS_STORAGE_KEY } from './constants';
import { clearAccess, readAccess, writeAccess } from './stores/accessStore';
import type { StoredAccess } from './types';
import { accessSummary } from './utils';

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

const access: StoredAccess = {
  token: 'jwt', tokenExpiresAt: '2026-12-01T00:00:00.000Z', username: '张三', expiresAt: '2026-12-01T00:00:00.000Z', remainingMatches: 3,
};

describe('access store', () => {
  const now = Date.parse('2026-11-16T00:00:00.000Z');

  it('keeps a valid token and drops expired or malformed records', () => {
    const storage = memoryStorage();
    writeAccess(access, storage);
    expect(readAccess(now, storage)).toEqual(access);
    expect(readAccess(Date.parse(access.tokenExpiresAt) + 1, storage)).toBeNull();
    expect(storage.items.has(ACCESS_STORAGE_KEY)).toBe(false);

    storage.setItem(ACCESS_STORAGE_KEY, '{not json');
    expect(readAccess(now, storage)).toBeNull();
    storage.setItem(ACCESS_STORAGE_KEY, JSON.stringify({ token: 1 }));
    expect(readAccess(now, storage)).toBeNull();
    expect(storage.items.has(ACCESS_STORAGE_KEY)).toBe(false);
  });

  it('treats unavailable storage as having no token', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
    expect(readAccess(now, broken)).toBeNull();
    expect(() => writeAccess(access, broken)).not.toThrow();
    expect(() => clearAccess(broken)).not.toThrow();
    expect(readAccess(now, null)).toBeNull();
  });
});

describe('access UI', () => {
  it('summarises the holder and remaining matches', () => {
    expect(accessSummary(access)).toBe('张三 · 剩余 3 局');
    expect(accessSummary({ ...access, remainingMatches: null })).toBe('张三');
    expect(renderToStaticMarkup(<AccessBadge access={access} onSignOut={() => {}} />)).toContain('身份码：张三 · 剩余 3 局');
  });

  it('asks for a code before starting and explains why', () => {
    const range = { min: 9, max: 12 };
    const bar = (needsAccess: boolean) => renderToStaticMarkup(
      <SetupActionBar boardName="预女猎白" count={9} range={range} hint={null} topicPartial={false} submitting={false} needsAccess={needsAccess} />);
    expect(bar(true)).toContain('输入身份码开局');
    expect(bar(false)).toContain('开始对局');

    const dialog = renderToStaticMarkup(<AccessCodeDialog notice={null} error="身份码不正确" submitting={false} onSubmit={() => {}} onCancel={() => {}} />);
    expect(dialog).toContain('观战和回放不需要身份码');
    expect(dialog).toContain('role="alert"');
    expect(renderToStaticMarkup(<AccessCodeDialog notice="身份码已停用，请联系管理员" error={null} submitting onSubmit={() => {}} onCancel={() => {}} />))
      .toContain('身份码已停用');
  });
});
