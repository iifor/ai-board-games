/** 定期清扫的间隔（按操作次数计），避免每次访问都遍历整个表 */
const SWEEP_EVERY = 256;

/**
 * 滑动窗口计数：按 key 记录窗口内的时间戳，用于登录失败锁定与开局限流（进程内）。
 * 过期条目在访问该 key 时移除；其他 key 的过期条目由定期清扫移除，表的大小由窗口内的请求数决定，不会无限增长。
 */
export function createWindowCounter(windowMs: number) {
  const entries = new Map<string, number[]>();
  let operations = 0;

  function recent(key: string, at: number): number[] {
    const times = (entries.get(key) ?? []).filter((time) => at - time < windowMs);
    if (times.length) entries.set(key, times);
    else entries.delete(key);
    return times;
  }

  function sweep(at: number): void {
    for (const key of [...entries.keys()]) recent(key, at);
  }

  function tick(at: number): void {
    operations += 1;
    if (operations % SWEEP_EVERY === 0) sweep(at);
  }

  return {
    /** 窗口内的次数 */
    count(key: string, at: number): number {
      tick(at);
      return recent(key, at).length;
    },
    /** 记一次，返回记录后窗口内的次数 */
    record(key: string, at: number): number {
      tick(at);
      const times = [...recent(key, at), at];
      entries.set(key, times);
      return times.length;
    },
    clear(key: string): void {
      entries.delete(key);
    },
    sweep,
    size: (): number => entries.size,
  };
}

export type WindowCounter = ReturnType<typeof createWindowCounter>;
