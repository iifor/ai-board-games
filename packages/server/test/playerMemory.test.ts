import type { AiRequest } from '@battle/engine';
import type { MemoryReviewCallPage, PlayerMemoryPage } from '@battle/shared';
import { sql } from 'kysely';
import { expect, it } from 'vitest';
import { interpretReview, reviewMaterial } from '../src/modules/player-memory/reflection';
import { LlmError, type LlmClient } from '../src/modules/llm';
import { answerFor, seedPlayers } from './support/fixtures';
import { createTestApp, dataOf, type TestApp } from './support/testApp';

async function finish(t: TestApp, id: string) {
  for (let i = 0; i < 150; i++) {
    await t.services.repositories.matches.markAcked(id, 1_000_000);
    await t.services.worker.idle();
    const row = await t.services.repositories.matches.find(id);
    if (row?.status === 'completed') return;
    expect(row?.status).not.toBe('failed');
  }
  throw new Error('测试局未完成');
}

it('records private grounded memories across two real match workflows and distinguishes offered, cited and rejected outputs', async () => {
  let invalidNext = false;
  const mainFailures = ['network', 'invalid', 'save', 'budget'];
  let nextCorrection = '';
  let exhaustedBudget = 0;
  let fullMaterialLength = 0;
  const llm: LlmClient = { async complete(request) {
    if (request.messages[0]?.content.startsWith('你正在写自己的赛后记忆')) {
      const failure = request.model === 'main-model' ? mainFailures.shift() : undefined;
      if (failure === 'network') throw new LlmError('模型返回 503：暂不可用', true);
      if (failure === 'invalid') {
        nextCorrection = 'memories.0.evidence';
        return { content: '{"memories":[{"content":"反思","evidence":"1"}]}', usage: { promptTokens: 90, completionTokens: 2 } };
      }
      if (failure === 'budget') {
        exhaustedBudget = request.maxTokens;
        fullMaterialLength = request.messages[1]!.content.length;
        return { content: '{"memories":[', truncated: true, usage: { promptTokens: 500, completionTokens: request.maxTokens } };
      }
      if (nextCorrection) {
        expect(request.messages[0]!.content).toContain(nextCorrection);
        nextCorrection = '';
      }
      if (exhaustedBudget) {
        expect(request.messages[0]!.content).toContain('达到预算');
        expect(request.messages[1]!.content.length).toBeLessThan(fullMaterialLength);
        expect(request.maxTokens).toBeGreaterThanOrEqual(Math.min(1600, exhaustedBudget));
        exhaustedBudget = 0;
      }
      const material: ReturnType<typeof reviewMaterial> = JSON.parse(request.messages[1]!.content);
      const observation = material.evidence.find(e => e.text.includes('这是我的发言'))!;
      const previous = material.previous[0];
      const decision = material.decisions[0]!;
      const subject = previous ? material.seats.find(s => s.playerId === previous.subjectId) : material.seats.find(s => s.playerId !== material.owner.playerId);
      const memories = [{ content: failure === 'save' ? '测试记忆保存失败' : material.owner.persona + '记得对方先陈述观点。', subjectSeat: subject!.seat,
        previousId: previous?.id ?? null, evidence: [observation.seq], requestId: decision.requestId, outcome: 'unresolved' }];
      return { content: JSON.stringify({ memories }), usage: null };
    }
    const user = request.messages[1]!.content;
    const offered = /^M(\d+) /m.exec(user)?.[1];
    const evidence = /^#(\d+) /m.exec(user)?.[1];
    if (offered && invalidNext) {
      invalidNext = false;
      return { content: JSON.stringify({ memoryNote: { judgement: '拒绝的回复', cited: [Number(offered)] } }), usage: null };
    }
    const output = JSON.parse(answerFor(request)) as Record<string, unknown>;
    output.memoryNote = { judgement: '我会核对这次说法', evidence: [Number(evidence ?? 0), 987654],
      cited: offered && user.includes('合法目标座位号') ? [Number(offered), 987654] : [987654] };
    return { content: JSON.stringify(output), usage: null };
  } };
  const t = await createTestApp({}, { llm });
  try {
    const token = await t.adminToken();
    const ids = await seedPlayers(t, 9);
    const owner = ids[0]!;
    for (const id of ids) await t.services.players.update(id, { persona: '人设' + id + '。' });
    const path = '/api/admin/player-memory/players/' + owner;
    expect((await t.call('GET', path)).status).toBe(401);
    expect((await t.call('GET', path + '?limit=10000', { token })).status).toBe(400);
    t.services.worker.start();
    const first = await t.services.matches.createPublic({ gameKey: 'debate', playerIds: ids }, 'first');
    await finish(t, first.id);
    await sql`alter table player_memories add check (content <> '测试记忆保存失败')`.execute(t.db);
    for (let i = 0; i < ids.length; i++) expect(await t.services.memoryWorker.runOne()).toBe(true);
    expect(await t.services.memoryWorker.runOne()).toBe(false);
    const allCalls = (await Promise.all(ids.map(async id => dataOf(await t.call<MemoryReviewCallPage>('GET',
      '/api/admin/player-memory/players/' + id + '/calls', { token }))))).flatMap(page => page.records);
    expect((await t.call('GET', path + '/calls')).status).toBe(401);
    expect(allCalls).toHaveLength(ids.length + 4);
    expect(allCalls.filter(c => c.status === 'saved')).toHaveLength(ids.length);
    expect(allCalls.filter(c => c.isBackup && c.status === 'saved')).toHaveLength(4);
    expect(allCalls.every(c => c.jobAttempt === 1 && c.matchId === first.id)).toBe(true);
    expect(allCalls).toContainEqual(expect.objectContaining({ status: 'invalid_reply', detail: expect.stringContaining('memories.0.evidence'), promptTokens: 90, completionTokens: 2 }));
    expect(allCalls).toContainEqual(expect.objectContaining({ status: 'call_failed', detail: '模型输出预算耗尽', promptTokens: 500 }));
    expect(allCalls).toContainEqual(expect.objectContaining({ status: 'call_failed', detail: '供应商 HTTP 503', promptTokens: null }));
    expect(allCalls).toContainEqual(expect.objectContaining({ status: 'save_failed', detail: '记忆保存事务失败' }));
    const page = () => t.call<PlayerMemoryPage>('GET', path, { token }).then(dataOf);
    const record = (await page()).records[0]!;
    expect(record).toMatchObject({ ownerId: owner, matchId: first.id, uses: [], decision: { judgement: '我会核对这次说法' } });
    const source = (await t.services.matches.log(first.id)).find(e => e.seq === record.evidence[0]?.seq);
    expect(source).toMatchObject({ kind: 'speech', channel: 'public' });
    expect(record.decision!.evidence.every(e => e.seq !== 987654)).toBe(true);
    invalidNext = true;
    const alternate = (await t.services.models.list()).find(m => m.model === 'backup-model')!;
    const originalSeat = first.seats.find(s => s.playerId === owner)!;
    const originalProfile = await t.services.players.get(owner);
    await t.services.players.update(owner, { name: '', modelId: alternate.id });
    expect(await t.services.players.get(owner)).toMatchObject({ id: owner, persona: originalProfile.persona, voiceId: originalProfile.voiceId });
    const second = await t.services.matches.createPublic({ gameKey: 'debate', playerIds: [...ids].reverse() }, 'second');
    await finish(t, second.id);
    expect(second.seats.find(s => s.playerId === owner)?.name).toBe(alternate.name);
    expect((await t.services.matches.publicSummary(first.id)).seats).toContainEqual(originalSeat);
    expect(first.seats.filter(s => s.name === originalSeat.name)).toHaveLength(ids.length);
    const after = (await page()).records[0]!;
    expect(after.uses.some(d => d.explicitlyCited)).toBe(true);
    expect(after.uses.some(d => d.accepted && !d.explicitlyCited)).toBe(true);
    expect(after.uses.every(d => d.matchId === second.id)).toBe(true);
    const requests = await t.db.selectFrom('aiTasks').select(['seat', 'request']).where('matchId', '=', second.id).execute();
    for (const task of requests) {
      const request = task.request as AiRequest;
      expect(request.memoryContext?.offered).toHaveLength(1);
      const memory = request.memoryContext!.offered[0]!;
      expect(memory.content).toContain('人设' + second.seats.find(s => s.seat === task.seat)!.playerId + '。');
      const subject = second.seats.find(s => s.playerId === memory.subjectId)!;
      expect(request.prompt.history).toContain('本局' + subject.seat + '号 ' + subject.name);
    }
    const events = await t.db.selectFrom('matchStageEvents').select('event').where('matchId', '=', second.id).execute();
    const ownerSeat = second.seats.find(p => p.playerId === owner)!.seat;
    const opening = await t.services.repositories.matches.nextEvent(second.id, 0);
    expect(opening?.view.seats.find(s => s.seat === ownerSeat)).toMatchObject({
      name: alternate.name, modelKey: alternate.model, persona: originalProfile.persona,
    });
    const earlier = await t.services.repositories.matches.nextEvent(first.id, 0);
    expect(earlier?.view.seats.find(s => s.seat === originalSeat.seat)?.name).toBe(originalSeat.name);
    expect(JSON.stringify(events)).not.toMatch(/memoryNote|我会核对这次说法|记得对方先陈述观点/);
    const trace = await t.services.traces.overview(second.id);
    const cited = after.uses.find(d => d.explicitlyCited)!;
    const node = trace.nodes.find(n => n.kind === 'decision' && n.requestIds.includes(cited.requestId))!;
    const detail = await t.services.traces.node(second.id, node.id);
    expect(detail.requests[0]?.memory?.decision?.cited).toEqual([record.id]);
    const rejected = trace.nodes.find(n => n.label === '校验拒绝')!;
    expect((await t.services.traces.node(second.id, rejected.id)).requests.find(r => r.id === rejected.requestIds[0])?.memory?.decision).toBeNull();
    const snapshot = (await t.services.repositories.matches.snapshot(first.id))!;
    const material = reviewMaterial({ ...snapshot, log: [...snapshot.log,
      { kind: 'narration', text: '别人夜里的秘密', seq: 9999, round: 1, phaseId: 'night', channel: 'private:2' },
      { kind: 'narration', text: '观众专用信息', seq: 10000, round: 1, phaseId: 'night', channel: 'spectator' },
    ] }, owner, []);
    expect(JSON.stringify(material)).not.toMatch(/别人夜里的秘密|观众专用信息/);
    expect(() => interpretReview({ memories: [{ content: '越权样本', subjectSeat: null, evidence: [9999],
      requestId: null, previousId: null, outcome: 'unresolved' }] }, material)).toThrow('未提供');
    for (let i = 0; i < ids.length; i++) await t.services.memoryWorker.runOne();
    expect((await page()).records[0]?.previousId).toBe(record.id);
    await t.services.traces.remove(second.id);
    expect((await page()).records.find(m => m.id === record.id)?.uses).toHaveLength(after.uses.length);
  } finally { await t.cleanup(); }
}, 60_000);

it('carries network retries, field feedback and output-limit adjustments across queue claims', async () => {
  const reviews: { prompt: string; budget: number }[] = [];
  const llm: LlmClient = { async complete(request) {
    const prompt = request.messages[0]!.content;
    if (!prompt.startsWith('你正在写自己的赛后记忆')) return { content: answerFor(request), usage: null };
    reviews.push({ prompt, budget: request.maxTokens });
    switch (reviews.length) {
      case 1: throw new LlmError('模型调用超时', true);
      case 2: return { content: '{"memories":{}}', usage: null };
      case 4: throw new LlmError('达到输出上限', false, false, true);
      case 5: return { content: '{"memories":', usage: null, truncated: true };
      default: return { content: '{"memories":[]}', usage: null };
    }
  } };
  const t = await createTestApp({}, { llm });
  try {
    const ids = await seedPlayers(t, 9);
    t.services.worker.start();
    const match = await t.services.matches.createPublic({ gameKey: 'debate', playerIds: ids }, 'queue-retry');
    await finish(t, match.id);
    await t.db.updateTable('models').set({ fallbackModelId: null, maxTokens: 4096 }).where('model', '=', 'main-model').execute();
    await t.db.updateTable('playerMemoryReviews').set({ availableAt: new Date(Date.now() + 86_400_000) }).execute();
    for (const owner of ids.slice(0, 2)) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        await t.db.updateTable('playerMemoryReviews').set({ availableAt: new Date(0) }).where('ownerId', '=', owner).execute();
        expect(await t.services.memoryWorker.runOne()).toBe(true);
        const job = await t.db.selectFrom('playerMemoryReviews').select(['status', 'attempts']).where('ownerId', '=', owner).executeTakeFirstOrThrow();
        expect(job).toEqual({ status: attempt < 3 ? 'queued' : 'done', attempts: attempt });
      }
    }
    expect(reviews[1]).toEqual(reviews[0]);
    expect(reviews[2]?.prompt).toContain('memories：');
    expect(reviews.slice(3).map(r => r.budget)).toEqual([1600, 3200, 4096]);
    expect(reviews[3]?.prompt).not.toContain('上一次回复的校验错误');
  } finally { await t.cleanup(); }
}, 60_000);
