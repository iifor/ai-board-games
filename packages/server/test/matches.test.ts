import { API_ERROR_CODES, type MatchDetailDto, type MatchSummaryDto, type ModelDto } from '@battle/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { failingLlm, quotaExhaustedLlm, runUntilSettled, scriptedLlm, seedPlayers } from './support/fixtures';
import { createTestApp, dataOf, type TestApp } from './support/testApp';

describe('scripted debug matches', () => {
  let t: TestApp;
  let token: string;
  beforeAll(async () => {
    t = await createTestApp();
    token = await t.adminToken();
    t.services.worker.start();
  });
  afterAll(async () => t.cleanup());

  it('runs a debate to the end without calling a model', async () => {
    const playerIds = await seedPlayers(t, 9);
    const created = dataOf(await t.call<MatchSummaryDto>('POST', '/api/admin/matches', {
      token,
      body: { gameKey: 'debate', playerIds, scripted: true, pacing: 'free' },
    }));
    expect(created.layout).toBe('versus');
    await runUntilSettled(t, created.id);
    const detail = dataOf(await t.call<MatchDetailDto>('GET', `/api/admin/matches/${created.id}`, { token }));
    expect(detail).toMatchObject({ status: 'completed', debug: true, scripted: true, chaos: false, layout: 'versus' });
    expect(detail.result?.winner).toMatch(/pro|con|draw/);
    expect(dataOf(await t.call<unknown[]>('GET', `/api/admin/matches/${created.id}/ai-calls`, { token }))).toEqual([]);
    const log = dataOf(await t.call<{ kind: string }[]>('GET', `/api/admin/matches/${created.id}/log`, { token }));
    expect(log.some((entry) => entry.kind === 'game_over')).toBe(true);
  });

  it('pauses at breakpoints and resumes on command', async () => {
    const playerIds = await seedPlayers(t, 12);
    const created = dataOf(await t.call<MatchSummaryDto>('POST', '/api/admin/matches', {
      token,
      body: { gameKey: 'werewolf', variant: 'white-wolf-king-guard-12', playerIds, scripted: true, pacing: 'free', breakpoints: ['dawn'], seed: 3 },
    }));
    await runUntilSettled(t, created.id);
    const paused = dataOf(await t.call<MatchDetailDto>('GET', `/api/admin/matches/${created.id}`, { token }));
    expect(paused).toMatchObject({ status: 'paused', phaseId: 'dawn', variantName: '白狼王&守卫', layout: 'circle' });
    const resumed = dataOf(await t.call<MatchDetailDto>('POST', `/api/admin/matches/${created.id}/debug`, { token, body: { command: 'run' } }));
    expect(resumed.status).not.toBe('paused');
    await runUntilSettled(t, created.id);
    expect((await t.services.repositories.matches.find(created.id))?.status).toBe('completed');
    const notPaused = await t.call('POST', `/api/admin/matches/${created.id}/debug`, { token, body: { command: 'run' } });
    expect(notPaused.status).toBe(409);
  });

  it('deletes a match with its events and tasks', async () => {
    const playerIds = await seedPlayers(t, 9);
    const created = dataOf(await t.call<MatchSummaryDto>('POST', '/api/admin/matches', { token, body: { gameKey: 'debate', playerIds, scripted: true, pacing: 'free' } }));
    expect((await t.call('DELETE', `/api/admin/matches/${created.id}`, { token })).status).toBe(200);
    expect((await t.call('GET', `/api/toc/matches/${created.id}`)).status).toBe(404);
  });
});

describe('model-backed matches', () => {
  it('runs a debate through the model and records every call', async () => {
    const llm = scriptedLlm();
    const t = await createTestApp({}, { llm });
    try {
      const token = await t.adminToken();
      t.services.worker.start();
      const playerIds = await seedPlayers(t, 9);
      const created = dataOf(await t.call<MatchSummaryDto>('POST', '/api/admin/matches', { token, body: { gameKey: 'debate', playerIds, pacing: 'free' } }));
      await runUntilSettled(t, created.id);
      const match = await t.services.repositories.matches.find(created.id);
      expect(match?.status).toBe('completed');
      const calls = dataOf(await t.call<{ modelName: string; prompt: Record<string, string>; error: string | null }[]>('GET', `/api/admin/matches/${created.id}/ai-calls`, { token }));
      expect(calls.length).toBe(llm.calls.length);
      expect(calls.every((call) => call.error === null && call.prompt.instruction)).toBe(true);
      expect(match?.snapshot.log.filter((entry) => entry.kind === 'fallback')).toEqual([]);
    } finally {
      await t.cleanup();
    }
  });

  it('disables a model whose quota is exhausted and keeps playing on the fallback model', async () => {
    const llm = quotaExhaustedLlm(['main-model']);
    const t = await createTestApp({}, { llm });
    try {
      const token = await t.adminToken();
      t.services.worker.start();
      const playerIds = await seedPlayers(t, 9);
      const created = dataOf(await t.call<MatchSummaryDto>('POST', '/api/admin/matches', { token, body: { gameKey: 'debate', playerIds, pacing: 'free' } }));
      await runUntilSettled(t, created.id);
      const match = await t.services.repositories.matches.find(created.id);
      expect(match?.status).toBe('completed');
      expect(match?.snapshot.log.filter((entry) => entry.kind === 'fallback')).toEqual([]);
      const models = dataOf(await t.call<ModelDto[]>('GET', '/api/admin/models', { token }));
      expect(models.find((model) => model.model === 'main-model')).toMatchObject({ enabled: false, disabledReason: 'quota_exhausted' });
      expect(models.find((model) => model.model === 'backup-model')).toMatchObject({ enabled: true, disabledReason: null });
      // 停用后不再调用主模型，也不重试：主模型的调用次数不超过并发数
      expect(llm.calls.filter((call) => call.model === 'main-model').length).toBeLessThanOrEqual(t.config.ai.concurrency);
      expect(llm.calls.some((call) => call.model === 'backup-model')).toBe(true);
    } finally {
      await t.cleanup();
    }
  });

  it('switches to the fallback model, and falls back in the engine when every model fails', async () => {
    const llm = failingLlm(['main-model']);
    const t = await createTestApp({}, { llm });
    try {
      const token = await t.adminToken();
      t.services.worker.start();
      const playerIds = await seedPlayers(t, 9);
      const created = dataOf(await t.call<MatchSummaryDto>('POST', '/api/admin/matches', { token, body: { gameKey: 'debate', playerIds, pacing: 'free' } }));
      await runUntilSettled(t, created.id);
      expect((await t.services.repositories.matches.find(created.id))?.status).toBe('completed');
      const models = new Set(llm.calls.map((call) => call.model));
      expect(models).toEqual(new Set(['main-model', 'backup-model']));

      const broken = failingLlm(['broken-main', 'broken-backup']);
      const t2 = await createTestApp({}, { llm: broken });
      try {
        const token2 = await t2.adminToken();
        t2.services.worker.start();
        const ids = await seedPlayers(t2, 9, { primary: 'broken-main', fallback: 'broken-backup' });
        const match = dataOf(await t2.call<MatchSummaryDto>('POST', '/api/admin/matches', { token: token2, body: { gameKey: 'debate', playerIds: ids, pacing: 'free' } }));
        await runUntilSettled(t2, match.id);
        const row = await t2.services.repositories.matches.find(match.id);
        expect(row?.status).toBe('completed');
        expect(row?.snapshot.log.filter((entry) => entry.kind === 'fallback').length).toBeGreaterThan(0);
      } finally {
        await t2.cleanup();
      }
    } finally {
      await t.cleanup();
    }
  });
});

describe('public matches', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ matches: { maxActive: 2, idleMs: 30 * 60_000 } }, { llm: scriptedLlm() });
    t.services.worker.start();
  });
  afterAll(async () => t.cleanup());

  it('only runs ahead of the audience by a few events', async () => {
    const playerIds = await seedPlayers(t, 9);
    const created = dataOf(await t.call<MatchSummaryDto>('POST', '/api/toc/matches', { body: { gameKey: 'debate', playerIds } }));
    await t.services.worker.idle();
    const match = await t.services.repositories.matches.find(created.id);
    expect(match?.status).toBe('waiting_ai');
    const before = match?.lastSeq ?? 0;
    for (let seq = 1; seq <= before; seq += 1) await t.services.repositories.matches.markAcked(created.id, seq);
    t.services.bus.emit('match:acked', { matchId: created.id, seq: before });
    await t.services.worker.idle();
    expect((await t.services.repositories.matches.find(created.id))?.lastSeq).toBeGreaterThan(before);
  });

  it('validates players and limits concurrent public matches', async () => {
    const missing = await t.call('POST', '/api/toc/matches', { body: { gameKey: 'debate', playerIds: [999_999] } });
    expect(missing).toMatchObject({ status: 400 });
    const playerIds = await seedPlayers(t, 5);
    const tooFew = await t.call('POST', '/api/toc/matches', { body: { gameKey: 'debate', playerIds } });
    expect(tooFew).toMatchObject({ status: 400, body: { message: expect.stringContaining('9-12') } });
    const more = await seedPlayers(t, 9);
    await t.call('POST', '/api/toc/matches', { body: { gameKey: 'debate', playerIds: more } });
    const blocked = await t.call('POST', '/api/toc/matches', { body: { gameKey: 'debate', playerIds: more } });
    expect(blocked).toMatchObject({ status: 429, body: { code: API_ERROR_CODES.tooManyRequests } });
  });

  it('lists only completed public matches in history', async () => {
    const history = dataOf(await t.call<MatchSummaryDto[]>('GET', '/api/toc/matches'));
    expect(history.every((match) => match.status === 'completed' && !match.debug)).toBe(true);
  });
});

describe('match listing and viewer progress', () => {
  let t: TestApp;
  let token: string;
  const created: MatchSummaryDto[] = [];
  beforeAll(async () => {
    t = await createTestApp();
    token = await t.adminToken();
    // worker 不启动：对局停在开局后的 waiting_ai，事件数稳定
    for (let index = 0; index < 3; index += 1) {
      const playerIds = await seedPlayers(t, 9);
      created.push(await t.services.matches.createDebug({ gameKey: 'debate', playerIds, scripted: true, pacing: 'free' }));
    }
  });
  afterAll(async () => t.cleanup());

  it('lists seats for every match in a bounded number of queries', async () => {
    const listed = dataOf(await t.call<MatchSummaryDto[]>('GET', '/api/admin/matches', { token }));
    expect(listed.map((match) => match.id).sort()).toEqual(created.map((match) => match.id).sort());
    // 列表里每局的座位与单独查该局时一致，且按座位号排序
    for (const match of listed) {
      expect(match.seats).toEqual(dataOf(await t.call<MatchSummaryDto>('GET', `/api/admin/matches/${match.id}`, { token })).seats);
      expect(match.seats.map((seat) => seat.seat)).toEqual(match.seats.map((_seat, index) => index + 1));
    }
    // 对局一查、座位一查：查询次数不随对局数增加
    const executeQuery = vi.spyOn(t.db.getExecutor(), 'executeQuery');
    try {
      const again = await t.services.matches.list({ limit: 50 });
      expect(again).toEqual(listed);
      expect(executeQuery).toHaveBeenCalledTimes(2);
    } finally {
      executeQuery.mockRestore();
    }
  });

  it('never records an acknowledgement beyond the events that exist', async () => {
    const id = created[0]?.id ?? '';
    const before = await t.services.repositories.matches.find(id);
    expect(before?.lastSeq).toBeGreaterThan(0);
    // 重连时客户端报的 afterSeq 若超过已有事件，确认进度只记到 last_seq，ack 节奏的闸门不会被抬到事件之前；也只增不减
    await t.services.repositories.matches.markAcked(id, 1_000_000);
    expect((await t.services.repositories.matches.find(id))?.ackedSeq).toBe(before?.lastSeq);
    await t.services.repositories.matches.markAcked(id, 0);
    expect((await t.services.repositories.matches.find(id))?.ackedSeq).toBe(before?.lastSeq);
  });
});
