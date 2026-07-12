import { positiveInt } from '../../utils/concurrencyLimiter';
import { concurrencySnapshot } from '../../utils/runtimeConcurrencyMetrics';

interface GameCapacity {
  tryAcquire(): (() => void) | null;
  stats(): { limit: number; active: number; rejected: number };
}

interface SessionStartGuard {
  run<T>(session: object, replay: boolean, task: () => Promise<T>): Promise<T>;
}

function createGameCapacity(value: unknown): GameCapacity {
  const limit = positiveInt(value, 5);
  let active = 0;
  let rejected = 0;
  return {
    tryAcquire() {
      if (active >= limit) {
        rejected += 1;
        return null;
      }
      active += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        active -= 1;
      };
    },
    stats: () => ({ limit, active, rejected }),
  };
}

const gameCapacity = createGameCapacity(process.env.MAX_CONCURRENT_GAMES || 5);

function createSessionStartGuard(capacity: GameCapacity): SessionStartGuard {
  const running = new WeakSet<object>();
  return {
    async run<T>(session: object, replay: boolean, task: () => Promise<T>): Promise<T> {
      if (running.has(session)) throw new Error('当前连接已有游戏正在运行');
      const release = replay ? () => undefined : capacity.tryAcquire();
      if (!release) {
        console.warn(JSON.stringify(concurrencySnapshot(capacity.stats())));
        throw new Error('服务器繁忙，请稍后重试');
      }
      running.add(session);
      if (!replay) console.log(JSON.stringify(concurrencySnapshot(capacity.stats())));
      try {
        return await task();
      } finally {
        running.delete(session);
        release();
        if (!replay) console.log(JSON.stringify(concurrencySnapshot(capacity.stats())));
      }
    },
  };
}

const sessionStartGuard = createSessionStartGuard(gameCapacity);

export { createGameCapacity, createSessionStartGuard, gameCapacity, sessionStartGuard };
export type { GameCapacity, SessionStartGuard };
