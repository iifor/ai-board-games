import type { EventBus } from '../../utils/eventBus';
import { logger } from '../../utils/logger';
import type { MatchRuntime } from '../matches/runtime';
import { PREFETCH_EVENTS } from '../matches/types';
import type { TaskExecutor } from './executor';
import type { AiTaskRepository, ClaimedTask } from './repository';

export interface WorkerOptions {
  readonly concurrency: number;
  readonly pollMs?: number;
}

/** AI worker：事件驱动 + 定时兜底轮询（处理重试与过期领取） */
export function createAiWorker(
  deps: { tasks: AiTaskRepository; executor: TaskExecutor; runtime: MatchRuntime; bus: EventBus },
  options: WorkerOptions,
) {
  const running = new Set<Promise<void>>();
  let claiming = false;
  let stopped = true;
  let timer: NodeJS.Timeout | null = null;
  const unsubscribes: (() => void)[] = [];

  async function run(task: ClaimedTask): Promise<void> {
    try {
      const { input, completion } = await deps.executor.execute(task);
      await deps.runtime.advanceMatch(task.matchId, input, completion);
    } catch (error) {
      logger.error('AI 任务处理失败', { matchId: task.matchId, requestId: task.requestId, error: (error as Error).message });
    }
  }

  async function kick(): Promise<void> {
    if (stopped || claiming) return;
    claiming = true;
    try {
      while (!stopped && running.size < options.concurrency) {
        const claimed = await deps.tasks.claim(options.concurrency - running.size, PREFETCH_EVENTS);
        if (!claimed.length) break;
        for (const task of claimed) {
          const job = run(task).finally(() => {
            running.delete(job);
            void kick();
          });
          running.add(job);
        }
      }
    } catch (error) {
      logger.error('领取 AI 任务失败', { error: (error as Error).message });
    } finally {
      claiming = false;
    }
  }

  return {
    start(): void {
      if (!stopped) return;
      stopped = false;
      unsubscribes.push(deps.bus.on('tasks:queued', () => void kick()), deps.bus.on('match:acked', () => void kick()));
      timer = setInterval(() => void kick(), options.pollMs ?? 1000);
      void kick();
    },
    async stop(): Promise<void> {
      stopped = true;
      if (timer) clearInterval(timer);
      unsubscribes.splice(0).forEach((unsubscribe) => unsubscribe());
      await Promise.allSettled([...running]);
    },
    /** 测试用：等待当前没有正在执行的任务且没有可领取的任务 */
    async idle(): Promise<void> {
      for (;;) {
        await kick();
        if (!running.size && !claiming) return;
        await Promise.race([...running, new Promise((resolve) => setTimeout(resolve, 20))]);
      }
    },
  };
}

export type AiWorker = ReturnType<typeof createAiWorker>;
