import type { PromptComparisonContext, PromptComparisonInput, PromptComparisonRecord, TraceRequestDto } from '@battle/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LlmClient, LlmRequest } from '../src/modules/llm';
import { answerFor, runUntilSettled, seedPlayers } from './support/fixtures';
import { createTestApp, dataOf, type TestApp } from './support/testApp';

let t: TestApp;
let token: string;
let matchId: string;
let request: TraceRequestDto;
let url: string;
let primary: number;
const sent: LlmRequest[] = [];
let nextReply: (() => string) | undefined;
const llm: LlmClient = { complete: async input => {
  sent.push(input);
  return { content: nextReply ? nextReply() : answerFor(input), usage: { promptTokens: 16, completionTokens: 8 } };
} };
const post = (draft: PromptComparisonInput) => t.call<PromptComparisonRecord>('POST', url, { token, body: draft });

beforeAll(async () => {
  t = await createTestApp({}, { llm });
  token = await t.adminToken();
  const ids = await seedPlayers(t, 9);
  for (const id of ids) {
    const p = await t.services.players.get(id);
    await t.services.players.update(id, { ...p, persona: '稳健，先听对方意见' });
  }
  primary = (await t.services.players.get(ids[0]!)).modelId!;
  t.services.worker.start();
  const match = await t.services.matches.createDebug({ gameKey: 'debate', playerIds: ids, pacing: 'free', seed: 5 });
  matchId = match.id;
  await runUntilSettled(t, matchId);
  const trace = await t.services.traces.overview(matchId);
  const node = trace.nodes.find(n => n.kind === 'request' && n.phaseId === 'crossfire')!;
  request = (await t.services.traces.node(matchId, node.id)).requests.find(r => r.id === node.requestIds[0])!;
  url = `/api/admin/traces/${matchId}/requests/${encodeURIComponent(request.id)}/comparisons`;
});
afterAll(async () => t.cleanup());

describe('历史请求双版本对比', () => {
  it('仅管理员可读写；两版共用历史调用参数，其他四层和角色身份保持原样', async () => {
    const before = await t.services.traces.overview(matchId);
    const count = sent.length;
    expect((await t.call('GET', url)).status).toBe(401);
    const ctx = dataOf(await t.call<PromptComparisonContext>('GET', url, { token }));
    expect(ctx.persona).toBe('稳健，先听对方意见');
    expect(ctx.history).toEqual([]);
    const call = request.calls[0]!;
    expect(call.settings!.temperature).toBeGreaterThanOrEqual(0.6);
    expect(call.settings!.temperature).toBeLessThanOrEqual(1);
    const draft = { model: { callId: call.id }, persona: '先追问证据', instruction: '请给出一个反例。' };
    expect((await t.call('POST', url, { body: draft })).status).toBe(401);
    expect((await t.call('POST', url, { token, body: { ...draft, history: '改写历史' } })).status).toBe(400);
    expect((await post({ ...draft, model: { callId: 2147483647 } })).status).toBe(404);
    expect(sent.length).toBe(count);
    nextReply = () => '{"speech":"请举例。"}';
    const saved = dataOf(await post(draft));
    expect(sent.length).toBe(count + 2);
    const [original, modified] = sent.slice(-2);
    expect(original!.messages).toEqual(request.messages);
    expect(modified!.messages).toEqual([
      { role: 'system', content: [request.prompt.platform, request.prompt.rules, ctx.fixedIdentity + '\n\n你的人设：先追问证据'].join('\n\n') },
      { role: 'user', content: [`对局记录：\n${request.prompt.history}`, '当前任务：\n请给出一个反例。', request.prompt.output].join('\n\n') },
    ]);
    expect({ ...original, messages: [] }).toEqual({ ...modified, messages: [] });
    expect(saved.settings).toEqual(call.settings);
    expect(saved.original.issues).toEqual([]);
    expect(saved.modified.usage?.completionTokens).toBe(8);
    expect((await t.services.traces.overview(matchId)).calls).toEqual(before.calls);
    expect(dataOf(await t.call<PromptComparisonContext>('GET',url,{token})).history[0]).toEqual(saved);
  });
  it('脚本请求可显式选模型；结构合法的越界目标也会标出', async () => {
    const ids = await seedPlayers(t, 9);
    const scripted = await t.services.matches.createDebug({ gameKey: 'debate', playerIds: ids, pacing: 'free', scripted: true, seed: 2 });
    await runUntilSettled(t, scripted.id);
    const detail = await t.services.traces.overview(scripted.id);
    expect(detail.calls).toHaveLength(0);
    const node = detail.nodes.find(n => n.kind === 'request' && n.label === 'vote')!;
    const req = (await t.services.traces.node(scripted.id, node.id)).requests.find(r => r.id === node.requestIds[0])!;
    expect(req.action).toBe('vote');
    expect(req.legalTargets).not.toContain(90);
    const path = `/api/admin/traces/${scripted.id}/requests/${encodeURIComponent(req.id)}/comparisons`;
    nextReply = () => '{"target":90}';
    const result = dataOf(await t.call<PromptComparisonRecord>('POST', path, { token, body: {
      model: { modelId: primary }, persona: '询问论据', instruction: req.prompt.instruction,
    } }));
    expect(result.original.issues).toContain('目标超出历史合法座位范围');
    expect((await t.services.traces.overview(scripted.id)).calls).toHaveLength(0);
  });

  it('显式选当前模型，一侧异常不会掩盖另一侧结果；删除链路清除实验', async () => {
    let i = 0;
    nextReply = () => { if (i++ === 0) throw Error('sensitive upstream error'); return 'invalid format'; };
    const record = dataOf(await post({ model: { modelId: primary }, persona: '', instruction: '换一种提问方式' }));
    expect(record.original.error).toBeTruthy();
    expect(record.modified.issues.length).toBeGreaterThan(0);
    expect(record.modified.raw).toBe('invalid format');
    expect(JSON.stringify(record)).not.toContain('sensitive upstream');
    await t.services.traces.remove(matchId);
    expect((await t.call('GET',url,{token})).status).toBe(404);
    expect(await t.db.selectFrom('promptComparisons').select('id').where('matchId','=',matchId).execute()).toEqual([]);
  });
});
