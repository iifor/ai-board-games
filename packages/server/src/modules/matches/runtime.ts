import { advance, EngineInputError, SpecMismatchError, type CompiledGame, type EngineInput } from '@battle/engine';
import type { MatchStatus } from '@battle/shared';
import type { Transaction } from 'kysely';
import type { Database } from '../../db/schema';
import type { EventBus } from '../../utils/eventBus';
import { conflict, notFound } from '../../utils/errors';
import { logger } from '../../utils/logger';
import type { MatchRepository } from './repository';
import { TERMINAL_STATUSES, type AdvanceOutcome, type TaskCompletion } from './types';

const NOTHING: Omit<AdvanceOutcome, 'status'> = { events: [], tasks: [], stale: false };

/** 对局由旧版本的游戏定义创建，部署新代码后无法继续时展示给观众的原因 */
export const SPEC_MISMATCH_ERROR = '游戏规则已更新，这局无法继续，已终止';
/** 引擎内部出错（spec 写错等）时展示给观众的原因；详情只写服务端日志 */
const ENGINE_FAILURE_ERROR = '对局运行出错，已终止';

/**
 * 对局推进：在一个事务里锁定对局行 → 调用引擎 advance → 写回快照、AI 任务、舞台事件（以及完成的任务）。
 * 提交后通过事件总线通知 AI worker 与实时网关。
 */
export function createMatchRuntime(repository: MatchRepository, findGame: (key: string) => CompiledGame, bus: EventBus) {
  /** 在已锁定对局行的事务里终止对局：标为失败、记下触发的任务（如有）、取消其余未完成任务 */
  async function terminate(trx: Transaction<Database>, matchId: string, error: string, completion?: TaskCompletion): Promise<void> {
    await repository.markFailed(trx, matchId, error);
    if (completion) await repository.completeTask(trx, matchId, completion);
    await repository.cancelOpenTasks(trx, [matchId]);
  }

  async function advanceMatch(matchId: string, input: EngineInput, completion?: TaskCompletion): Promise<AdvanceOutcome> {
    const outcome = await repository.transaction(async (trx): Promise<AdvanceOutcome> => {
      const row = await repository.lock(trx, matchId);
      if (!row) throw notFound('对局');
      if (TERMINAL_STATUSES.has(row.status)) {
        // 已结束的对局：迟到的 AI 结果直接作废，其他输入（如调试指令）视为冲突
        if (!completion) throw conflict('对局已结束');
        await repository.completeTask(trx, matchId, { ...completion, status: 'cancelled' });
        return { ...NOTHING, status: row.status, stale: true };
      }
      // 先做纯计算：引擎错误在这里处理；数据库写入在 try 之外，出错时整个事务回滚并向上抛出
      let result: ReturnType<typeof advance>;
      try {
        result = advance(findGame(row.gameKey), row.snapshot, input);
      } catch (error) {
        if (error instanceof EngineInputError) {
          // AI 结果过期（阶段已被跳转等）不算错误；其他非法输入交给调用方
          if (!completion) throw conflict(error.message);
          await repository.completeTask(trx, matchId, { ...completion, status: 'cancelled', error: error.message });
          return { ...NOTHING, status: row.status, stale: true };
        }
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof SpecMismatchError) {
          // 快照来自旧版本的游戏定义：当前代码永远推进不了它，立即终止，不能当成过期结果留在 waiting_ai
          logger.warn('对局的游戏定义已更新，终止对局', { matchId, error: message });
          await terminate(trx, matchId, SPEC_MISMATCH_ERROR, completion && { ...completion, status: 'cancelled', error: message });
          return { ...NOTHING, status: 'failed' };
        }
        logger.error('对局推进失败', { matchId, error: message });
        await terminate(trx, matchId, ENGINE_FAILURE_ERROR, completion && { ...completion, status: 'failed' });
        return { ...NOTHING, status: 'failed' };
      }
      const lastSeq = result.stageEvents.reduce((max, event) => Math.max(max, event.seq), row.lastSeq);
      const status: MatchStatus = result.status;
      await repository.saveAdvance(trx, matchId, { snapshot: result.snapshot, status, lastSeq, result: result.snapshot.result });
      await repository.insertTasks(trx, matchId, result.aiRequests);
      await repository.insertEvents(trx, matchId, result.stageEvents);
      if (completion) await repository.completeTask(trx, matchId, completion);
      return { status, events: result.stageEvents, tasks: result.aiRequests, stale: false };
    });

    if (outcome.events.length) {
      bus.emit('match:events', { matchId, lastSeq: Math.max(...outcome.events.map((event) => event.seq)) });
    }
    if (outcome.tasks.length) bus.emit('tasks:queued', { matchId });
    if (!outcome.stale) bus.emit('match:status', { matchId, status: outcome.status });
    return outcome;
  }

  /**
   * AI 任务多次失败后由 worker 调用：对局标为失败、记下任务错误、取消其余任务，并通知在线观众。
   * 已结束的对局不再改动。
   */
  async function failMatch(matchId: string, error: string, completion: TaskCompletion): Promise<boolean> {
    const failed = await repository.transaction(async (trx) => {
      const row = await repository.lock(trx, matchId);
      if (!row || TERMINAL_STATUSES.has(row.status)) return false;
      await terminate(trx, matchId, error, completion);
      return true;
    });
    if (failed) bus.emit('match:status', { matchId, status: 'failed' });
    return failed;
  }

  return { advanceMatch, failMatch };
}

export type MatchRuntime = ReturnType<typeof createMatchRuntime>;
