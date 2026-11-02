import { CHAOS_FAILURE_REASON, type LogEntry } from '@battle/engine';
import { API_ERROR_CODES, type MatchDetailDto, type MatchSummaryDto } from '@battle/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CHAOS_REQUIRES_SCRIPTED } from '../src/modules/matches/validator';
import { runUntilSettled, seedPlayers } from './support/fixtures';
import { createTestApp, dataOf, type TestApp } from './support/testApp';

describe('chaos scripted debug matches', () => {
  let t: TestApp;
  let token: string;
  beforeAll(async () => {
    t = await createTestApp();
    token = await t.adminToken();
    t.services.worker.start();
  });
  afterAll(async () => t.cleanup());

  it('rejects the chaos script unless the match is scripted', async () => {
    const playerIds = await seedPlayers(t, 9);
    const implicit = await t.call('POST', '/api/admin/matches', { token, body: { gameKey: 'debate', playerIds, chaos: true, pacing: 'free' } });
    expect(implicit).toMatchObject({ status: 400, body: { code: API_ERROR_CODES.validation, message: expect.stringContaining(CHAOS_REQUIRES_SCRIPTED) } });
    const explicit = await t.call('POST', '/api/admin/matches', { token, body: { gameKey: 'debate', playerIds, scripted: false, chaos: true, pacing: 'free' } });
    expect(explicit).toMatchObject({ status: 400, body: { message: expect.stringContaining('chaos') } });
  });

  it('keeps a chaos werewolf match running through simulated failures and fallbacks, and reports chaos in every DTO', async () => {
    const playerIds = await seedPlayers(t, 12);
    // 混沌脚本由种子决定：逐个种子跑到结束，直到遇到一局含"模拟调用失败"的（3% × 上百次请求，前几个种子里几乎必然出现）
    let found: string | null = null;
    for (let seed = 1; seed <= 6 && found === null; seed += 1) {
      const created = dataOf(await t.call<MatchSummaryDto>('POST', '/api/admin/matches', {
        token,
        body: { gameKey: 'werewolf', playerIds, scripted: true, chaos: true, pacing: 'free', seed },
      }));
      expect(created).toMatchObject({ debug: true, scripted: true, chaos: true });
      await runUntilSettled(t, created.id);
      // 每一局都必须正常结束：模拟失败走引擎兜底，不会把对局标成 failed，也不会触发 worker 的领取次数上限
      expect(await t.services.repositories.matches.find(created.id)).toMatchObject({ status: 'completed', error: null });
      const failedTasks = await t.db.selectFrom('aiTasks').select('error').where('matchId', '=', created.id).where('status', '=', 'failed').execute();
      if (failedTasks.length) {
        expect(failedTasks.every((task) => task.error === CHAOS_FAILURE_REASON)).toBe(true);
        found = created.id;
      }
    }
    expect(found).not.toBeNull();
    const id = found ?? '';

    const detail = dataOf(await t.call<MatchDetailDto>('GET', `/api/admin/matches/${id}`, { token }));
    expect(detail).toMatchObject({ status: 'completed', debug: true, scripted: true, chaos: true, error: null });
    expect(detail.result).not.toBeNull();
    const listed = dataOf(await t.call<MatchSummaryDto[]>('GET', '/api/admin/matches?debug=true', { token }));
    expect(listed.find((match) => match.id === id)).toMatchObject({ chaos: true });
    expect(dataOf(await t.call<MatchSummaryDto>('GET', `/api/toc/matches/${id}`))).toMatchObject({ chaos: true });

    // 没有调用过任何模型；模拟失败在日志里是一条 host 频道的兜底记录，带着混沌脚本给出的原因
    expect(dataOf(await t.call<unknown[]>('GET', `/api/admin/matches/${id}/ai-calls`, { token }))).toEqual([]);
    const log = dataOf(await t.call<LogEntry[]>('GET', `/api/admin/matches/${id}/log`, { token }));
    expect(log.some((entry) => entry.kind === 'fallback' && entry.channel === 'host' && entry.reason.includes(CHAOS_FAILURE_REASON))).toBe(true);
    expect(log.some((entry) => entry.kind === 'game_over')).toBe(true);
  });
});
