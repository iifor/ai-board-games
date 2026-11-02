import { advance, createSnapshot, type AiRequest } from '@battle/engine';
import { gameRegistry } from '@battle/games';
import { describe, expect, it } from 'vitest';
import { AI_GIVE_UP_ERROR, createAiWorker, type ClaimedTask } from '../src/modules/ai-worker';
import type { TaskCompletion } from '../src/modules/matches/types';
import { createEventBus } from '../src/utils/eventBus';

/** 用引擎真实生成一个 AI 请求，worker 不关心内容但类型要完整 */
function firstRequest(): AiRequest {
  const game = gameRegistry.get('debate');
  if (!game) throw new Error('没有辩论赛');
  const players = Array.from({ length: 9 }, (_, index) => ({ playerId: String(index + 1), name: `玩家${index + 1}`, persona: '', avatar: null }));
  const request = advance(game, createSnapshot(game, { seed: 1, players, params: {} }), { kind: 'start' }).aiRequests[0];
  if (!request) throw new Error('开局没有产生 AI 请求');
  return request;
}

describe('ai worker attempt cap', () => {
  it('fails the match once a task has been attempted the configured number of times, not before', async () => {
    const request = firstRequest();
    let attempts = 0;
    const failures: { matchId: string; error: string; completion: TaskCompletion }[] = [];
    const worker = createAiWorker({
      // 每次领取 attempts 加一（模拟领取过期后被重新领取）；三次之后没有任务
      tasks: {
        claim: async (): Promise<ClaimedTask[]> => {
          if (attempts >= 3) return [];
          attempts += 1;
          return [{ matchId: 'm_1', requestId: request.id, seat: request.seat, request, attempts }];
        },
      },
      executor: {
        execute: async () => {
          throw new Error('数据库连接中断');
        },
      },
      runtime: {
        advanceMatch: async () => {
          throw new Error('不应推进');
        },
        failMatch: async (matchId, error, completion) => {
          failures.push({ matchId, error, completion });
          return true;
        },
      },
      bus: createEventBus(),
    }, { concurrency: 1, maxAttempts: 2, pollMs: 5 });

    worker.start();
    await worker.idle();
    await worker.stop();
    expect(attempts).toBe(3);
    // 第 1 次失败只记日志等待重试；第 2 次达到上限终止对局；第 3 次（上限之后仍被领到）同样终止，而不是继续付费重试
    expect(failures.map((failure) => failure.completion.requestId)).toEqual([request.id, request.id]);
    expect(failures[0]).toMatchObject({ matchId: 'm_1', error: AI_GIVE_UP_ERROR, completion: { status: 'failed', error: '数据库连接中断' } });
  });
});
