import type { MatchSummaryDto } from '@battle/shared';
import { describe, expect, it } from 'vitest';
import { AI_GIVE_UP_ERROR } from '../src/modules/ai-worker';
import { PREFETCH_EVENTS } from '../src/modules/matches';
import { runUntilSettled, scriptedLlm, seedPlayers } from './support/fixtures';
import { createTestApp, dataOf } from './support/testApp';

describe('ai task bookkeeping', () => {
  it('leaves a finished task untouched when its result arrives again late', async () => {
    const t = await createTestApp();
    try {
      t.services.worker.start();
      const playerIds = await seedPlayers(t, 9);
      const created = await t.services.matches.createDebug({ gameKey: 'debate', playerIds, scripted: true, pacing: 'free' });
      await runUntilSettled(t, created.id);
      const done = await t.db.selectFrom('aiTasks').select(['requestId', 'output']).where('matchId', '=', created.id).where('status', '=', 'succeeded').executeTakeFirstOrThrow();
      // 迟到的重复结果：对局已结束，推进被判为过期，但不能把已成功的任务改成 cancelled
      const outcome = await t.services.runtime.advanceMatch(created.id, { kind: 'ai_result', requestId: done.requestId, output: done.output }, {
        requestId: done.requestId, status: 'cancelled', output: null, error: '迟到',
      });
      expect(outcome.stale).toBe(true);
      const after = await t.db.selectFrom('aiTasks').select(['status', 'error']).where('matchId', '=', created.id).where('requestId', '=', done.requestId).executeTakeFirstOrThrow();
      expect(after).toEqual({ status: 'succeeded', error: null });
    } finally {
      await t.cleanup();
    }
  });

  it('counts claims and lets the runtime fail the match with a user-facing reason once the worker gives up', async () => {
    const t = await createTestApp({}, { llm: scriptedLlm() });
    try {
      const playerIds = await seedPlayers(t, 9);
      const created = dataOf(await t.call<MatchSummaryDto>('POST', '/api/toc/matches', { body: { gameKey: 'debate', playerIds } }));
      const [first] = await t.services.repositories.aiTasks.claim(1, PREFETCH_EVENTS);
      expect(first?.attempts).toBe(1);
      await t.db.updateTable('aiTasks').set({ claimedUntil: new Date(Date.now() - 1000) }).where('matchId', '=', created.id).execute();
      const [again] = await t.services.repositories.aiTasks.claim(1, PREFETCH_EVENTS);
      expect(again).toMatchObject({ requestId: first?.requestId, attempts: 2 });

      const statuses: string[] = [];
      t.services.bus.on('match:status', (payload) => statuses.push(payload.status));
      const completion = { requestId: again?.requestId ?? '', status: 'failed' as const, output: null, error: '推进失败' };
      expect(await t.services.runtime.failMatch(created.id, AI_GIVE_UP_ERROR, completion)).toBe(true);
      expect(await t.services.repositories.matches.find(created.id)).toMatchObject({ status: 'failed', error: AI_GIVE_UP_ERROR });
      expect(dataOf(await t.call<MatchSummaryDto>('GET', `/api/toc/matches/${created.id}`)).status).toBe('failed');
      const tasks = await t.db.selectFrom('aiTasks').select(['requestId', 'status', 'error']).where('matchId', '=', created.id).execute();
      expect(tasks.find((task) => task.requestId === completion.requestId)).toMatchObject({ status: 'failed', error: '推进失败' });
      expect(tasks.filter((task) => task.requestId !== completion.requestId).every((task) => task.status === 'cancelled')).toBe(true);
      expect(statuses).toEqual(['failed']);
      // 已结束的对局不会被再次改动
      expect(await t.services.runtime.failMatch(created.id, '再来一次', completion)).toBe(false);
      expect((await t.services.repositories.matches.find(created.id))?.error).toBe(AI_GIVE_UP_ERROR);
    } finally {
      await t.cleanup();
    }
  });
});
