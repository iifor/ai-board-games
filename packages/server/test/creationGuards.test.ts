import type { MatchSummaryDto } from '@battle/shared';
import { describe, expect, it } from 'vitest';
import { scriptedLlm, seedPlayers } from './support/fixtures';
import { createTestApp, dataOf } from './support/testApp';

describe('public creation guards', () => {
  it('enforces the active-match cap even for concurrent requests', async () => {
    const t = await createTestApp({ matches: { maxActive: 2, idleMs: 30 * 60_000 } }, { llm: scriptedLlm() });
    try {
      const playerIds = await seedPlayers(t, 9);
      const results = await Promise.all(Array.from({ length: 6 }, () => t.call('POST', '/api/toc/matches', { body: { gameKey: 'debate', playerIds } })));
      expect(results.filter((result) => result.status === 201)).toHaveLength(2);
      expect(results.filter((result) => result.status === 429)).toHaveLength(4);
    } finally {
      await t.cleanup();
    }
  });

  it('ignores X-Forwarded-For unless the proxy is trusted, so the per-source limit cannot be spoofed', async () => {
    const t = await createTestApp({ matches: { maxActive: 100, idleMs: 30 * 60_000 } }, { llm: scriptedLlm() });
    try {
      const playerIds = await seedPlayers(t, 9);
      for (let index = 0; index < 10; index += 1) {
        const created = await t.call('POST', '/api/toc/matches', { body: { gameKey: 'debate', playerIds }, headers: { 'x-forwarded-for': `10.0.0.${index}` } });
        expect(created.status).toBe(201);
      }
      const spoofed = await t.call('POST', '/api/toc/matches', { body: { gameKey: 'debate', playerIds }, headers: { 'x-forwarded-for': '10.0.0.99' } });
      expect(spoofed).toMatchObject({ status: 429, body: { message: expect.stringContaining('频繁') } });
    } finally {
      await t.cleanup();
    }
  });

  it('reaps ack-paced public matches nobody has acknowledged for a while', async () => {
    const t = await createTestApp({}, { llm: scriptedLlm() });
    try {
      const playerIds = await seedPlayers(t, 9);
      const created = dataOf(await t.call<MatchSummaryDto>('POST', '/api/toc/matches', { body: { gameKey: 'debate', playerIds } }));
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
