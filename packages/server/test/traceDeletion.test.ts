import type { MatchDetailDto, MatchSummaryDto, MatchTraceDto, TraceMatchDto } from '@battle/shared';
import { expect, it } from 'vitest';
import { fakeTts, runUntilSettled, scriptedLlm, seedPlayers } from './support/fixtures';
import { listen, watch } from './support/stream';
import { createTestApp, dataOf } from './support/testApp';

it('deletes only the selected trace, purges calls and finished payloads, and still replays the original events and audio', async () => {
  const t = await createTestApp({}, { llm: scriptedLlm(), ttsProviders: { azure: fakeTts() } });
  const server = await listen(t);
  try {
    const token = await t.adminToken();
    const playerIds = await seedPlayers(t, 9);
    t.services.worker.start();
    const create = async () => dataOf(await t.call<MatchSummaryDto>('POST', '/api/toc/matches', { token: (await t.access()).token, body: { gameKey: 'debate', playerIds } }));
    const selected = await create();
    const original = await watch(server.port, selected.id, 0);
    expect(original.end?.type).toBe('end');
    expect(original.audio.some(Boolean)).toBe(true);
    const other = await create();
    const path = '/api/admin/traces/' + selected.id;
    const full = dataOf(await t.call<MatchTraceDto>('GET', path, { token }));
    expect(full.calls.length).toBeGreaterThan(0);
    expect((await t.call('DELETE', path)).status).toBe(401);
    expect((await t.call('DELETE', path, { token })).status).toBe(200);
    expect((await t.call('DELETE', path, { token })).status).toBe(200);
    expect((await t.call('GET', path, { token })).status).toBe(404);
    expect((await t.call('GET', path + '/nodes/' + full.nodes[0]!.id, { token })).status).toBe(404);
    const list = dataOf(await t.call<TraceMatchDto[]>('GET', '/api/admin/traces', { token }));
    expect(list.map((m) => m.id)).toContain(other.id);
    expect(list.map((m) => m.id)).not.toContain(selected.id);
    expect(dataOf(await t.call('GET', '/api/admin/matches/' + selected.id + '/ai-calls', { token }))).toEqual([]);
    expect(await t.db.selectFrom('matchTraceNodes').select('id').where('matchId', '=', selected.id).execute()).toEqual([]);
    const tasks = await t.db.selectFrom('aiTasks').select(['request', 'output', 'error']).where('matchId', '=', selected.id).execute();
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((task) => JSON.stringify(task.request) === '{}' && task.output === null && task.error === null)).toBe(true);
    const replay = await watch(server.port, selected.id, 0);
    expect(replay).toEqual(original);
    const audio = await t.app.request(replay.audio.find((url): url is string => url !== null)!);
    expect(audio.status).toBe(200);
    expect(dataOf(await t.call<MatchDetailDto>('GET', '/api/admin/matches/' + selected.id, { token })).traceDeleted).toBe(true);
    const index = await t.app.request('/api/admin/traces', { headers: { Authorization: 'Bearer ' + token } });
    expect(index.headers.get('cache-control')).toContain('no-store');
  } finally { await server.close(); await t.cleanup(); }
});

it('keeps an in-flight model match running without resurrecting deleted trace data', async () => {
  let started!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => { started = resolve; });
  const resume = new Promise<void>((resolve) => { release = resolve; });
  const llm = scriptedLlm();
  const t = await createTestApp({}, { llm: { complete: async (request) => {
    started(); await resume; return llm.complete(request);
  } } });
  try {
    const token = await t.adminToken();
    const playerIds = await seedPlayers(t, 9);
    t.services.worker.start();
    const m = dataOf(await t.call<MatchSummaryDto>('POST', '/api/admin/matches', { token, body: { gameKey: 'debate', playerIds, pacing: 'free' } }));
    await entered;
    expect((await t.call('DELETE', '/api/admin/traces/' + m.id, { token })).status).toBe(200);
    release();
    await runUntilSettled(t, m.id);
    expect((await t.services.matches.detail(m.id)).status).toBe('completed');
    expect(llm.calls.length).toBeGreaterThan(1);
    expect(await t.services.matches.aiCalls(m.id)).toEqual([]);
    expect(await t.db.selectFrom('matchTraceNodes').select('id').where('matchId', '=', m.id).execute()).toEqual([]);
    const tasks = await t.db.selectFrom('aiTasks').select(['status', 'request', 'output', 'error']).where('matchId', '=', m.id).execute();
    expect(tasks.every((task) => task.status === 'succeeded' && JSON.stringify(task.request) === '{}' && task.output === null && task.error === null)).toBe(true);
  } finally { release(); await t.cleanup(); }
});
