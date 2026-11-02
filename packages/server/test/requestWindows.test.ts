import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbWindowStore, createRequestWindowRepository } from '../src/modules/limits';
import { createTestApp, type TestApp } from './support/testApp';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => t.cleanup());

const rows = async () => t.db.selectFrom('requestWindows').select(['key', 'at']).orderBy('at').execute();

describe('request window store (database)', () => {
  it('counts strictly after `since` per key, clears a key and prunes old rows', async () => {
    const store = createDbWindowStore(createRequestWindowRepository(t.db), { retentionMs: 60_000 });
    const base = Date.now();
    await store.add('k1', new Date(base));
    await store.add('k1', new Date(base + 500));
    await store.add('k2', new Date(base + 500));
    expect(await store.count('k1', new Date(base - 1))).toBe(2);
    expect(await store.count('k1', new Date(base))).toBe(1);
    expect(await store.count('k1', new Date(base + 500))).toBe(0);
    expect(await store.count('k2', new Date(base - 1))).toBe(1);
    await store.clear('k1');
    expect(await store.count('k1', new Date(base - 1))).toBe(0);
    expect(await store.count('k2', new Date(base - 1))).toBe(1);
    await store.prune(new Date(base + 501));
    expect(await rows()).toEqual([]);
  });

  it('prunes rows older than the retention in the same statement as every Nth add', async () => {
    const store = createDbWindowStore(createRequestWindowRepository(t.db), { retentionMs: 1000, pruneEvery: 4 });
    const base = Date.now();
    await store.add('old', new Date(base - 5000));
    await store.add('old', new Date(base - 4000));
    await store.add('fresh', new Date(base - 100));
    expect(await rows()).toHaveLength(3);
    // 第 4 次 add：删掉早于 at - retention 的记录，再插入本次
    await store.add('fresh', new Date(base));
    expect((await rows()).map((row) => row.key)).toEqual(['fresh', 'fresh']);
  });
});
