/** 并发上限：同时最多 max 个任务在跑，其余按到达顺序排队（排队不占用任何外部资源） */
export function createSemaphore(max: number) {
  if (!Number.isInteger(max) || max < 1) throw new Error(`并发上限必须是正整数：${max}`);
  let running = 0;
  const waiting: Array<() => void> = [];

  function release(): void {
    const next = waiting.shift();
    if (next) next();
    else running -= 1;
  }

  return {
    async run<T>(work: () => Promise<T>): Promise<T> {
      if (running < max) running += 1;
      else await new Promise<void>((resolve) => waiting.push(resolve));
      try {
        return await work();
      } finally {
        release();
      }
    },
    /** 测试与诊断用 */
    stats: () => ({ running, waiting: waiting.length }),
  };
}

export type Semaphore = ReturnType<typeof createSemaphore>;
