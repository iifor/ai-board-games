import type { MatchDetailDto, MatchSummaryDto } from '@battle/shared';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SPEC_MISMATCH_ERROR } from '../src/modules/matches';
import { runUntilSettled, seedPlayers } from './support/fixtures';
import { createTestApp, dataOf, type TestApp } from './support/testApp';

/** 模拟部署了新规则：对局快照仍记着旧版本游戏定义的 hash */
async function markSpecOutdated(t: TestApp, matchId: string): Promise<void> {
  await t.db.updateTable('matches').set({ snapshot: sql`jsonb_set(snapshot, '{specHash}', '"outdated"')` }).where('id', '=', matchId).execute();
}

async function openTaskCount(t: TestApp, matchId: string): Promise<number> {
  const rows = await t.db.selectFrom('aiTasks').select('requestId').where('matchId', '=', matchId).where('status', 'in', ['queued', 'running']).execute();
  return rows.length;
}

describe('matches created by an outdated game definition', () => {
  let t: TestApp;
  let token: string;
  beforeAll(async () => {
    t = await createTestApp();
    token = await t.adminToken();
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it('fails a match waiting for AI instead of leaving it stuck', async () => {
    const playerIds = await seedPlayers(t, 9);
    const created = dataOf(await t.call<MatchSummaryDto>('POST', '/api/admin/matches', {
      token,
      body: { gameKey: 'debate', playerIds, scripted: true, pacing: 'free' },
    }));
    expect(await openTaskCount(t, created.id)).toBeGreaterThan(0);
    await markSpecOutdated(t, created.id);

    t.services.worker.start();
    try {
      await runUntilSettled(t, created.id);
    } finally {
      await t.services.worker.stop();
    }
    const match = await t.services.repositories.matches.find(created.id);
    expect(match).toMatchObject({ status: 'failed', error: SPEC_MISMATCH_ERROR });
    expect(await openTaskCount(t, created.id)).toBe(0);
    const cancelled = await t.db.selectFrom('aiTasks').select('error').where('matchId', '=', created.id).where('status', '=', 'cancelled').execute();
    expect(cancelled.some((task) => task.error?.includes('不匹配'))).toBe(true);
  });

  it('fails a paused debug match on the next debug command', async () => {
    const playerIds = await seedPlayers(t, 9);
    const created = dataOf(await t.call<MatchSummaryDto>('POST', '/api/admin/matches', {
      token,
      body: { gameKey: 'debate', playerIds, scripted: true, pacing: 'free', breakpoints: 'all' },
    }));
    expect((await t.services.repositories.matches.find(created.id))?.status).toBe('paused');
    await markSpecOutdated(t, created.id);

    const response = await t.call<MatchDetailDto>('POST', `/api/admin/matches/${created.id}/debug`, { token, body: { command: 'step' } });
    expect(dataOf(response)).toMatchObject({ status: 'failed', error: SPEC_MISMATCH_ERROR });
    const again = await t.call('POST', `/api/admin/matches/${created.id}/debug`, { token, body: { command: 'step' } });
    expect(again.status).toBe(409);
  });
});
