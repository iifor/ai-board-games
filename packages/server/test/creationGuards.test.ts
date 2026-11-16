import type { MatchSummaryDto } from '@battle/shared';
import { describe, expect, it } from 'vitest';
import { scriptedLlm, seedPlayers } from './support/fixtures';
import { createTestApp, dataOf } from './support/testApp';

describe('public creation guards', () => {
  it('enforces the active-match cap even for concurrent requests', async () => {
    const t = await createTestApp({ matches: { maxActive: 2, idleMs: 30 * 60_000 } }, { llm: scriptedLlm() });
    try {
      const playerIds = await seedPlayers(t, 9);
      const { token } = await t.access();
      const results = await Promise.all(Array.from({ length: 6 }, () => t.call('POST', '/api/toc/matches', { token, body: { gameKey: 'debate', playerIds } })));
      expect(results.filter((result) => result.status === 201)).toHaveLength(2);
      expect(results.filter((result) => result.status === 429)).toHaveLength(4);
    } finally {
      await t.cleanup();
    }
  });

  it('limits creation per access code, whatever address the requests come from', async () => {
    const t = await createTestApp({ matches: { maxActive: 100, idleMs: 30 * 60_000 } }, { llm: scriptedLlm() });
    try {
      const playerIds = await seedPlayers(t, 9);
      const { token } = await t.access();
      for (let index = 0; index < 10; index += 1) {
        const created = await t.call('POST', '/api/toc/matches', { token, body: { gameKey: 'debate', playerIds }, headers: { 'x-forwarded-for': `10.0.0.${index}` } });
        expect(created.status).toBe(201);
      }
      const limited = await t.call('POST', '/api/toc/matches', { token, body: { gameKey: 'debate', playerIds } });
      expect(limited).toMatchObject({ status: 429, body: { message: expect.stringContaining('频繁') } });
      // 另一个身份码有自己的额度
      const other = await t.access({ username: '另一位' });
      expect((await t.call('POST', '/api/toc/matches', { token: other.token, body: { gameKey: 'debate', playerIds } })).status).toBe(201);
    } finally {
      await t.cleanup();
    }
  });

  it('only offers and seats players whose primary or fallback model can actually be called', async () => {
    const t = await createTestApp({ matches: { maxActive: 100, idleMs: 30 * 60_000 } }, { llm: scriptedLlm() });
    try {
      const playerIds = await seedPlayers(t, 9);
      const primaryId = (await t.services.players.get(playerIds[0]!)).modelId!;
      const primary = await t.db.selectFrom('models').select(['fallbackModelId', 'providerId']).where('id', '=', primaryId).executeTakeFirstOrThrow();
      const listed = async () => dataOf(await t.call<{ id: number }[]>('GET', '/api/toc/players')).map((player) => player.id);
      const { token } = await t.access();
      const start = () => t.call('POST', '/api/toc/matches', { token, body: { gameKey: 'debate', playerIds } });

      // 主模型额度耗尽被停用：备用模型仍可用，照常开局
      await t.db.updateTable('models').set({ enabled: false }).where('id', '=', primaryId).execute();
      expect(await listed()).toEqual(expect.arrayContaining(playerIds));
      expect((await start()).status).toBe(201);

      // 主备都停用：不再出现在选人列表，也不能开局
      await t.db.updateTable('models').set({ enabled: false }).where('id', '=', primary.fallbackModelId!).execute();
      expect(await listed()).not.toContain(playerIds[0]);
      expect(await start()).toMatchObject({ status: 400, body: { message: expect.stringContaining('模型与备用模型都不可用') } });

      // 模型启用但供应商停用，同样不可用
      await t.db.updateTable('models').set({ enabled: true }).where('id', 'in', [primaryId, primary.fallbackModelId!]).execute();
      await t.db.updateTable('modelProviders').set({ enabled: false }).where('id', '=', primary.providerId).execute();
      expect(await listed()).not.toContain(playerIds[0]);
      expect((await start()).status).toBe(400);
    } finally {
      await t.cleanup();
    }
  });

  it('reaps ack-paced public matches nobody has acknowledged for a while', async () => {
    const t = await createTestApp({}, { llm: scriptedLlm() });
    try {
      const playerIds = await seedPlayers(t, 9);
      const created = dataOf(await t.call<MatchSummaryDto>('POST', '/api/toc/matches', { token: (await t.access()).token, body: { gameKey: 'debate', playerIds } }));
      const statuses: string[] = [];
      t.services.bus.on('match:status', (payload) => statuses.push(`${payload.matchId}:${payload.status}`));
      expect(await t.services.reaper.sweep()).toEqual([]);
      await t.db.updateTable('matches').set({ updatedAt: new Date(Date.now() - 2 * 60 * 60_000) }).where('id', '=', created.id).execute();
      expect(await t.services.reaper.sweep()).toEqual([created.id]);
      expect((await t.services.repositories.matches.find(created.id))?.status).toBe('failed');
      expect(statuses).toContain(`${created.id}:failed`);
      const tasks = await t.db.selectFrom('aiTasks').select('status').where('matchId', '=', created.id).execute();
      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks.every((task) => task.status === 'cancelled')).toBe(true);
      expect(await t.services.repositories.matches.countActivePublic(new Date(Date.now() - 30 * 60_000))).toBe(0);
    } finally {
      await t.cleanup();
    }
  });
});
