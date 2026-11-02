import type { EventBus } from '../../utils/eventBus';
import { logger } from '../../utils/logger';
import type { MatchRuntime } from '../matches/runtime';
import { PREFETCH_EVENTS } from '../matches/types';
import type { TaskExecutor } from './executor';
import type { AiTaskRepository, ClaimedTask } from './repository';

export interface WorkerOptions {
  readonly concurrency: number;
  /** 一个任务最多领取几次；超过后对局终止，不再重复付费调用模型 */
  readonly maxAttempts: number;
  readonly pollMs?: number;
}

export interface WorkerDeps {
  readonly tasks: Pick<AiTaskRepository, 'claim'>;
  readonly executor: Pick<TaskExecutor, 'execute'>;
  readonly runtime: Pick<MatchRuntime, 'advanceMatch' | 'failMatch'>;
  readonly bus: EventBus;
}

/** 任务多次失败后展示给观众的原因 */
export const AI_GIVE_UP_ERROR = 'AI 处理多次失败，对局已终止';

/** AI worker：事件驱动 + 定时兜底轮询（处理重试与过期领取） */
export function createAiWorker(deps: WorkerDeps, options: WorkerOptions) {
  const running = new Set<Promise<void>>();
  let claiming = false;
  let stopped = true;
  let timer: NodeJS.Timeout | null = null;
  const unsubscribes: (() => void)[] = [];

  /** 领取次数到上限：不再等下一次领取过期后重来，直接终止对局 */
  async function giveUp(task: ClaimedTask, error: string): Promise<void> {
    try {
      await deps.runtime.failMatch(task.matchId, AI_GIVE_UP_ERROR, { requestId: task.requestId, status: 'failed', output: null, error });
      logger.error('AI 任务多次失败，对局已终止', { matchId: task.matchId, requestId: task.requestId, attempts: task.attempts });
    } catch (failure) {
      logger.error('终止对局失败', { matchId: task.matchId, requestId: task.requestId, error: (failure as Error).message });
    }
  }

  async function run(task: ClaimedTask): Promise<void> {
    try {
      const { input, completion } = await deps.executor.execute(task);
      await deps.runtime.advanceMatch(task.matchId, input, completion);
    } catch (error) {
      const message = (error as Error).message;
      logger.error('AI 任务处理失败', { matchId: task.matchId, requestId: task.requestId, attempts: task.attempts, error: message });
      if (task.attempts >= options.maxAttempts) await giveUp(task, message);
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
