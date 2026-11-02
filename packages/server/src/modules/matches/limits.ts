import { tooManyRequests } from '../../utils/errors';
import { windowKey, type WindowStore } from '../../utils/windowStore';

export const CREATION_WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 10;

/** C 端开局限流：每个来源每小时最多 10 局；计数放在 WindowStore 里，多实例共享 */
export function createCreationLimiter(store: WindowStore, now: () => number = Date.now) {
  return {
    /** 超限抛 429，否则记一次。计数与记录不是同一条语句，并发请求可能略微越过上限：限流只求近似，不做串行化 */
    async check(source: string): Promise<void> {
      const current = now();
      const key = windowKey('creation', source);
      if (await store.count(key, new Date(current - CREATION_WINDOW_MS)) >= MAX_PER_WINDOW) throw tooManyRequests('开局过于频繁，请稍后再试');
      await store.add(key, new Date(current));
    },
  };
}

export type CreationLimiter = ReturnType<typeof createCreationLimiter>;
