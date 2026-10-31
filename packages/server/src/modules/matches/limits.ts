import { tooManyRequests } from '../../utils/errors';

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 10;

/** C 端开局限流：每个来源每小时最多 10 局（进程内计数） */
export function createCreationLimiter(now: () => number = Date.now) {
  const history = new Map<string, number[]>();
  return {
    check(source: string): void {
      const current = now();
      const recent = (history.get(source) ?? []).filter((time) => current - time < WINDOW_MS);
      if (recent.length >= MAX_PER_WINDOW) throw tooManyRequests('开局过于频繁，请稍后再试');
      history.set(source, [...recent, current]);
    },
  };
}

export type CreationLimiter = ReturnType<typeof createCreationLimiter>;
