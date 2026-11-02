import { tooManyRequests } from '../../utils/errors';
import { createWindowCounter } from '../../utils/windowCounter';

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 10;

/** C 端开局限流：每个来源每小时最多 10 局（进程内滑动窗口计数，过期来源会被清理） */
export function createCreationLimiter(now: () => number = Date.now) {
  const counter = createWindowCounter(WINDOW_MS);
  return {
    check(source: string): void {
      const current = now();
      if (counter.count(source, current) >= MAX_PER_WINDOW) throw tooManyRequests('开局过于频繁，请稍后再试');
      counter.record(source, current);
    },
  };
}

export type CreationLimiter = ReturnType<typeof createCreationLimiter>;
