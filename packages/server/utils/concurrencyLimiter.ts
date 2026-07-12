interface LimiterStats {
  limit: number;
  active: number;
  queued: number;
}

interface ConcurrencyLimiter {
  run<T>(task: () => Promise<T>): Promise<T>;
  stats(): LimiterStats;
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function createConcurrencyLimiter(value: unknown): ConcurrencyLimiter {
  const limit = positiveInt(value, 1);
  let active = 0;
  const queue: Array<() => void> = [];

  async function acquire(): Promise<void> {
    if (active < limit) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve) => queue.push(resolve));
    active += 1;
  }

  function release(): void {
    active -= 1;
    queue.shift()?.();
  }

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
    stats: () => ({ limit, active, queued: queue.length }),
  };
}

export { createConcurrencyLimiter, positiveInt };
export type { ConcurrencyLimiter, LimiterStats };
