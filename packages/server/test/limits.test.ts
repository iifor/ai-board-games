import { describe, expect, it } from 'vitest';
import { createCreationLimiter } from '../src/modules/matches';
import { AppError } from '../src/utils/errors';
import { createMemoryWindowStore, windowKey } from '../src/utils/windowStore';

describe('memory window store', () => {
  it('counts strictly after `since` and forgets a key once its entries are pruned', async () => {
    const store = createMemoryWindowStore({ retentionMs: 1000 });
    await store.add('a', new Date(0));
    await store.add('a', new Date(500));
    expect(await store.count('a', new Date(-1))).toBe(2);
    // 边界：since 本身不算
    expect(await store.count('a', new Date(0))).toBe(1);
    expect(await store.count('a', new Date(200))).toBe(1);
    expect(await store.count('a', new Date(500))).toBe(0);
    await store.prune(new Date(1));
    expect(await store.count('a', new Date(-1))).toBe(1);
    await store.prune(new Date(1000));
    expect(store.size()).toBe(0);
  });

  it('prunes expired keys that are never touched again every N adds', async () => {
    const store = createMemoryWindowStore({ retentionMs: 1000, pruneEvery: 50 });
    for (let i = 0; i < 20; i += 1) await store.add(`old-${i}`, new Date(0));
    expect(store.size()).toBe(20);
    // 另一些来源在保留期之后不断到来：旧来源没有再被访问，也会在第 50 次 add 时被清掉
    for (let i = 0; i < 30; i += 1) await store.add(`new-${i % 5}`, new Date(5000));
    expect(store.size()).toBe(5);
  });

  it('clears a key on demand', async () => {
    const store = createMemoryWindowStore({ retentionMs: 1000 });
    await store.add('a', new Date(0));
    await store.clear('a');
    expect(await store.count('a', new Date(-1))).toBe(0);
  });

  it('builds keys that cannot collide across parts containing the separator', () => {
    expect(windowKey('login', '1.1.1.1', 'admin')).toBe('login/1.1.1.1/admin');
    expect(windowKey('login', 'a/b', 'c')).not.toBe(windowKey('login', 'a', 'b/c'));
    expect(windowKey('x', 'with\u0000nul')).not.toContain('\u0000');
  });
});

describe('creation limiter', () => {
  it('allows ten matches per source per hour and lets the window slide', async () => {
    let now = 0;
    const limiter = createCreationLimiter(createMemoryWindowStore({ retentionMs: 60 * 60 * 1000 }), () => now);
    for (let i = 0; i < 10; i += 1) await limiter.check('1.1.1.1');
    await expect(limiter.check('1.1.1.1')).rejects.toThrow(AppError);
    await expect(limiter.check('2.2.2.2')).resolves.toBeUndefined();
    now = 60 * 60 * 1000 + 1;
    await expect(limiter.check('1.1.1.1')).resolves.toBeUndefined();
  });
});
