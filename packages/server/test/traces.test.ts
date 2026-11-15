import type { MatchSummaryDto, MatchTraceDto, TraceNodeDetailDto, TraceNodeDto } from '@battle/shared';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runUntilSettled, scriptedLlm, seedPlayers } from './support/fixtures';
import { createTestApp, dataOf, type TestApp } from './support/testApp';

describe('administrator match traces', () => {
  let t: TestApp;
  let token: string;
  const llm = scriptedLlm();
  let invalidReplies = 2;
  const base = '/api/admin/traces';
  const trace = async (id: string) => dataOf(await t.call<MatchTraceDto>('GET', base + '/' + id, { token }));
  const inspect = async (id: string, node: TraceNodeDto) =>
    dataOf(await t.call<TraceNodeDetailDto>('GET', base + '/' + id + '/nodes/' + node.id, { token }));

  beforeAll(async () => {
    t = await createTestApp({}, { llm: { complete: (request) => {
      if (invalidReplies-- > 0) return Promise.resolve({ content: 'not JSON', usage: { promptTokens: 3, completionTokens: 1 } });
      return llm.complete(request);
    } } });
    token = await t.adminToken();
    t.services.worker.start();
  });
  afterAll(async () => t.cleanup());

  it('follows a scripted vote from the emitted tally to every seat, its decision and its input', async () => {
    const match = dataOf(await t.call<MatchSummaryDto>('POST', '/api/admin/matches', {
      token, body: { gameKey: 'werewolf', generatePlayers: true, scripted: true, pacing: 'free', seed: 5 },
    }));
    await runUntilSettled(t, match.id);
    const full = await trace(match.id);
    expect(full.match.status).toBe('completed');
    expect(full.models).toEqual([]);
    expect(full.match.roleNames?.witch).toBe('女巫');
    expect(full.nodes[0]?.label).toBe('开局');
    expect(full.nodes.at(-1)?.label).toBe('game_over');
    const tally = full.nodes.find((n) => n.kind === 'stage' && n.label === 'vote_tallied' && n.requestIds.length > 1)!;
    const node = await inspect(match.id, tally);
    expect(node.event?.seq).toBe(tally.seq);
    expect(node.event?.kind).toBe('vote_tallied');
    if (node.event?.kind !== 'vote_tallied') throw new Error('缺失舞台计票');
    const participants = [...node.event.ballots.map((b) => b.voter), ...node.event.abstained].sort();
    const direct = node.requests.filter((r) => tally.requestIds.includes(r.id));
    expect(direct.map((r) => r.seat).sort()).toEqual(participants);
    for (const r of direct) {
      expect(r.calls).toEqual([]);
      expect(r.output).not.toBeNull();
      expect(r.prompt.instruction).toBeTruthy();
      expect(full.nodes.some((n) => n.kind === 'decision' && n.visit === tally.visit && n.phaseId === tally.phaseId && n.requestIds.includes(r.id))).toBe(true);
    }
    const settlement = full.nodes.find((n) => n.phaseId === tally.phaseId && n.visit === tally.visit && n.kind === 'settlement')!;
    expect((await inspect(match.id, settlement)).data).toHaveProperty('state');
    expect(JSON.stringify(node.event)).not.toContain('requestIds');

    expect((await t.call('GET', base)).status).toBe(401);
    expect((await t.call('GET', base + '/' + match.id)).status).toBe(401);
    expect((await t.call('GET', base + '/' + match.id + '/nodes/' + tally.id)).status).toBe(401);
    expect((await t.call('GET', base + '/other-match/nodes/' + tally.id, { token })).status).toBe(404);
    expect((await t.call('DELETE', '/api/admin/matches/' + match.id, { token })).status).toBe(200);
    expect((await t.call('GET', base + '/' + match.id + '/nodes/' + tally.id, { token })).status).toBe(404);
  });

  it('connects model attempts, validation retries, applied fallback and token totals', async () => {
    const playerIds = await seedPlayers(t, 9);
    const match = dataOf(await t.call<MatchSummaryDto>('POST', '/api/admin/matches', {
      token, body: { gameKey: 'debate', playerIds, pacing: 'free', seed: 9 },
    }));
    await runUntilSettled(t, match.id);
    const full = await trace(match.id);
    expect(full.match.status).toBe('completed');
    expect(full.models[0]).toMatchObject({ calls: llm.calls.length + 2, promptTokens: llm.calls.length * 10 + 6 });
    const rejected = full.nodes.find((n) => n.label === '校验拒绝')!;
    const fallback = full.nodes.find((n) => n.kind === 'decision' && n.label === '兜底')!;
    const retried = full.nodes.find((n) => n.kind === 'request' && n.requestIds[0] === fallback.requestIds[0])!;
    expect(retried.inputRequestId).toBe(rejected.requestIds[0]);
    const detail = await inspect(match.id, fallback);
    expect(detail.data).toHaveProperty('applied');
    expect(detail.requests[0]?.calls[0]).toMatchObject({ rawResponse: 'not JSON', usage: { promptTokens: 3 }, settings: { model: 'main-model' } });
    expect(detail.requests[0]?.messages[0]?.role).toBe('system');
    expect(JSON.stringify(detail)).not.toContain('sk-test');
    const speech = full.nodes.find((n) => n.label === 'speech' && n.requestIds[0] === fallback.requestIds[0])!;
    expect((await inspect(match.id, speech)).event?.kind).toBe('speech');
  });

  it('rolls game state and nodes back together when trace persistence fails', async () => {
    const match = dataOf(await t.call<MatchSummaryDto>('POST', '/api/admin/matches', {
      token, body: { gameKey: 'debate', generatePlayers: true, scripted: true, breakpoints: 'all' },
    }));
    const before = await trace(match.id);
    const countTasks = () => t.db.selectFrom('aiTasks').select('requestId').where('matchId', '=', match.id).execute();
    const tasksBefore = await countTasks();
    await sql`alter table match_trace_nodes add constraint test_reject_step check (label <> 'step') not valid`.execute(t.db);
    try {
      expect((await t.call('POST', '/api/admin/matches/' + match.id + '/debug', { token, body: { command: 'step' } })).status).toBe(500);
      expect(await trace(match.id)).toEqual(before);
      expect(await countTasks()).toEqual(tasksBefore);
    } finally {
      await sql`alter table match_trace_nodes drop constraint test_reject_step`.execute(t.db);
    }
  });
});
