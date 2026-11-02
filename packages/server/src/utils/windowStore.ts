/**
 * 滑动窗口计数的存储：按 key 记录时间点，供开局限流与登录锁定使用。
 * 生产用数据库实现（modules/limits），多实例共享同一份计数；内存实现只用于单元测试。
 */
export interface WindowStore {
  /** since 之后（不含）的记录数 */
  count(key: string, since: Date): Promise<number>;
  add(key: string, at: Date): Promise<void>;
  clear(key: string): Promise<void>;
  /** 删除 before 之前（不含）的记录 */
  prune(before: Date): Promise<void>;
}

export interface WindowStoreOptions {
  /** 记录最长保留多久：所有使用方里最长的窗口 */
  readonly retentionMs: number;
  /** 每多少次 add 顺带清理一次过期记录 */
  readonly pruneEvery?: number | undefined;
}

export const DEFAULT_PRUNE_EVERY = 64;

/** 多段组成的 key：各段 URL 编码后以 / 连接，段里出现分隔符也不会串；不含 NUL，可直接存数据库 */
export function windowKey(...parts: readonly string[]): string {
  return parts.map((part) => encodeURIComponent(part)).join('/');
}

/** 内存实现：语义与数据库实现一致（含定期清理），供单元测试使用 */
export function createMemoryWindowStore(options: WindowStoreOptions) {
  const pruneEvery = options.pruneEvery ?? DEFAULT_PRUNE_EVERY;
  const entries = new Map<string, number[]>();
  let adds = 0;

  function prune(before: Date): void {
    for (const [key, times] of entries) {
      const kept = times.filter((time) => time >= before.getTime());
      if (kept.length) entries.set(key, kept);
      else entries.delete(key);
    }
  }

  return {
    count: async (key: string, since: Date): Promise<number> =>
      (entries.get(key) ?? []).filter((time) => time > since.getTime()).length,
    async add(key: string, at: Date): Promise<void> {
      adds += 1;
      if (adds % pruneEvery === 0) prune(new Date(at.getTime() - options.retentionMs));
      entries.set(key, [...(entries.get(key) ?? []), at.getTime()]);
    },
    async clear(key: string): Promise<void> {
      entries.delete(key);
    },
    async prune(before: Date): Promise<void> {
      prune(before);
    },
    /** 测试用：还有记录的 key 数 */
    size: (): number => entries.size,
  } satisfies WindowStore & { size(): number };
}
