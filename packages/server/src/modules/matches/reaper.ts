import type { EventBus } from '../../utils/eventBus';
import { logger } from '../../utils/logger';
import type { MatchRepository } from './repository';

export interface ReaperOptions {
  /** 多久没有观众确认视为无人观看 */
  readonly idleMs: number;
  readonly intervalMs?: number;
}

export const IDLE_MATCH_ERROR = '长时间无人观看，已自动结束';

/**
 * 回收无人观看的公开对局：ack 节奏下观众离开后引擎很快停在 waiting_ai，
 * 这些对局不该一直占着"进行中"的名额、挂着排队的 AI 任务。调试局不回收。
 */
export function createMatchReaper(deps: { readonly repository: Pick<MatchRepository, 'failIdle'>; readonly bus: EventBus }, options: ReaperOptions) {
  let timer: NodeJS.Timeout | null = null;

  async function sweep(): Promise<string[]> {
    const ids = await deps.repository.failIdle(new Date(Date.now() - options.idleMs), IDLE_MATCH_ERROR);
    for (const matchId of ids) deps.bus.emit('match:status', { matchId, status: 'failed' });
    if (ids.length) logger.info('已回收无人观看的对局', { count: ids.length });
    return ids;
  }

  return {
    sweep,
    start(): void {
      if (timer) return;
      timer = setInterval(() => {
        sweep().catch((error: unknown) => logger.error('回收对局失败', { error: error instanceof Error ? error.message : String(error) }));
      }, options.intervalMs ?? 60_000);
    },
    stop(): void {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}

export type MatchReaper = ReturnType<typeof createMatchReaper>;
