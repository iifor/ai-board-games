import { gameRegistry } from '@battle/games';
import type { CatalogComparison, CatalogPreview, PromptCatalogDetail, PromptCatalogItem } from '@battle/shared';
import type { AiRequest } from '@battle/engine';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestApp, dataOf, type TestApp } from './support/testApp';
import { runUntilSettled, seedPlayers } from './support/fixtures';
import type { LlmClient, LlmRequest } from '../src/modules/llm';

let t: TestApp;
let token: string;
let modelId: number;
const calls: LlmRequest[] = [];
const llm: LlmClient = { complete: async request => {
  calls.push(request);
  return { content: JSON.stringify({ speech: '请回应刚才提出的问题。' }), usage: null };
} };
const root = '/api/admin/prompts';
const example = { kind: 'example', index: 0 };
beforeAll(async () => {
  t = await createTestApp({}, { llm });
  token = await t.adminToken();
  const [player] = await seedPlayers(t, 1);
  modelId = (await t.services.players.get(player!)).modelId!;
});
afterAll(async () => { await t?.cleanup(); });

it('lists every model-facing template and previews edits in each template’s own sample context without model calls', async () => {
  expect((await t.call('GET', root)).status).toBe(401);
  const catalog = dataOf(await t.call<PromptCatalogItem[]>('GET', root, { token }));
  for (const [key, game] of gameRegistry) {
    const excluded = key === 'werewolf' ? ['nightFalls', 'dawn', 'postgameReveal'] : ['topicAnnounce'];
    expect(catalog.filter(i => i.group === key).map(i => i.key).sort()).toEqual([...game.prompts.keys()].filter(k => !excluded.includes(k)).sort());
  }
  expect(catalog.filter(i => i.group === 'system').map(i => i.key).sort()).toEqual(['modelTest', 'platform', 'playerExpression', 'replaySuggest']);
  expect(catalog.filter(i => i.pilot)).toHaveLength(2);
  for (const [key, title] of [['witchSave', '使用解药'], ['witchPoison', '使用毒药']]) {
    expect(catalog.find(i => i.group === 'werewolf' && i.key === key)?.title).toBe(title);
  }
  for (const item of catalog) {
    const path = root + '/' + item.group + '/' + item.key;
    const detail = dataOf(await t.call<PromptCatalogDetail>('GET', path, { token }));
    expect(detail.examples.length, item.key).toBeGreaterThan(0);
    const source = detail.source + '\n请核对。';
    const view = dataOf(await t.call<CatalogPreview>('POST', path + '/preview', { token, body: { example, source } }));
    expect(view.rendered, item.key).toBeTruthy();
    expect(view.rendered, item.key).not.toContain('{{');
    expect(view.draft, item.key).toMatch(/\n请核对。$/);
    expect(view.draft?.slice(0, -'\n请核对。'.length).trimEnd(), item.key).toBe(view.rendered);
  }
  expect(calls).toHaveLength(0);
});

it('previews a private self-destruct decision from the listening wolf’s perspective', async () => {
  const path = root + '/werewolf/selfDestructDecision';
  const detail = dataOf(await t.call<PromptCatalogDetail>('GET', path, { token }));
  const sample = detail.examples.find(option => option.ref.kind === 'example')!;
  const preview = dataOf(await t.call<CatalogPreview>('POST', path + '/preview', { token, body: { example: sample.ref } }));
  expect(preview.rendered).toContain('请私下决定是否立即自爆');
  expect(preview.rendered).toMatch(/\d+号/);
  expect(preview.layers?.output).toContain('targets');
});

it('previews a targeted wolf reply with its requested task and team history', async () => {
  const path = root + '/werewolf/wolfChatReply';
  const detail = dataOf(await t.call<PromptCatalogDetail>('GET', path, { token }));
  const example = detail.examples.find(s => s.ref.kind === 'example')!;
  const view = dataOf(await t.call<CatalogPreview>('POST', path + '/preview', { token, body: { example: example.ref } }));
  expect(view.rendered).toContain('请你确认：明天开口时帮我核对昨天的票型');
  expect(view.layers?.history).toContain('核对昨天的票型，可以吗');
});

it('previews both wolf chat turns using the actual first proposal in teammate history', async () => {
  const path = root + '/werewolf/wolfChat';
  const detail = dataOf(await t.call<PromptCatalogDetail>('GET', path, { token }));
  const samples = detail.examples.filter(option => option.ref.kind === 'example');
  expect(samples.map(s => s.label)).toEqual([expect.stringContaining('首位提议'), expect.stringContaining('队友回应')]);
  const views = await Promise.all(samples.map(async s => dataOf(await t.call<CatalogPreview>('POST', path + '/preview',
    { token, body: { example: s.ref } }))));
  expect(views[0]!.rendered).toContain('由你先提议');
  expect(views[1]!.rendered).toContain('认同就只说「同意」');
  expect(views[1]!.layers?.history).toMatch(/我提议今晚选\d+号/);
});

it.each([['werewolf', 'nightFalls'], ['debate', 'topicAnnounce']])('excludes host narration from prompt routes: %s/%s', async (group, key) => {
  const path = root + '/' + group + '/' + key;
  expect((await t.call('GET', path, { token })).status).toBe(404);
  expect((await t.call('POST', path + '/preview', { token, body: { example } })).status).toBe(404);
  expect((await t.call('PUT', path, { token, body: { source: '不能从这里修改', revision: 0 } })).status).toBe(404);
});

it('edits sheriff signup as a fixed draft and keeps model comparison restricted to the two pilots', async () => {
  const path = root + '/werewolf/sheriffSignup';
  const source = '请选择是否上警，并按 {"choice":{"seat":3}} 的格式作答。';
  const body = { source, example };
  const before = calls.length;
  const preview = dataOf(await t.call<CatalogPreview>('POST', path + '/preview', { token, body }));
  expect(preview.draft).toBe(source);
  expect(preview.source).not.toBe(source);
  expect((await t.call('POST', path + '/preview', { token, body: { ...body, source: '{{unknown}}' } })).status).toBe(400);
  expect((await t.call('POST', path + '/compare', { token, body: { ...body, modelId } })).status).toBe(400);
  const next = dataOf(await t.call<CatalogPreview>('POST', path + '/preview', { token, body: { example } }));
  expect(next.source).toBe(preview.source);
  expect(next.draft).toBeNull();
  expect(calls.length).toBe(before);
});

it.each([['werewolf', 'daySpeech'], ['debate', 'crossfireQuestion']])('compares %s/%s on the same seat and settings', async (group, key) => {
  const path = root + '/' + group + '/' + key;
  const detail = dataOf(await t.call<PromptCatalogDetail>('GET', path, { token }));
  expect(detail.examples.length).toBeGreaterThan(1);
  const source = detail.source + ' 我是{{me.label}}。';
  const first = dataOf(await t.call<CatalogPreview>('POST', path + '/preview', { token, body: { source, example } }));
  const second = dataOf(await t.call<CatalogPreview>('POST', path + '/preview', { token, body: { source, example: { ...example, index: 1 } } }));
  expect(first.draft).not.toEqual(second.draft);
  const before = calls.length;
  const result = dataOf(await t.call<CatalogComparison>('POST', path + '/compare', { token, body: { source, example, modelId } }));
  const pair = calls.slice(before);
  expect(pair).toHaveLength(2);
  const [old, changed] = pair;
  expect(changed).toEqual({ ...old, messages: [old!.messages[0],
    { role: 'user', content: old!.messages[1]!.content.replace(first.rendered, first.draft!) }] });
  expect(result.modified.issues).toEqual([]);
  expect(result.draft).toEqual(first.draft);
  expect((await t.call('POST', path + '/compare', { token, body: { source: '{{state.unknown}}', example, modelId } })).status).toBe(400);
  expect((await t.call('POST', path + '/preview', { token, body: { source: '{{me.label', example } })).status).toBe(400);
  expect((await t.call('POST', root + '/system/modelTest/compare', { token, body: { source, example, modelId } })).status).toBe(400);
  expect(calls.length).toBe(before + 2);
});

it('matches historical requests by template, honours old records and trace deletion', async () => {
  t.services.worker.start();
  const match = await t.services.matches.createDebug({ gameKey: 'debate', generatePlayers: true, scripted: true, pacing: 'free', seed: 11 });
  await runUntilSettled(t, match.id);
  const path = root + '/debate/crossfireQuestion';
  const detail = dataOf(await t.call<PromptCatalogDetail>('GET', path, { token }));
  const ref = detail.examples.find(s => s.ref.kind === 'history')?.ref;
  if (ref?.kind !== 'history') throw new Error('缺历史请求');
  const draft = { example: ref, source: detail.source + '我是{{me.label}}。' };
  const current = dataOf(await t.call<CatalogPreview>('POST', path + '/preview', { token, body: draft }));
  expect(current.source).toBe(detail.source);
  expect(current.draft).not.toContain('{{');
  expect((await t.call('POST', root + '/debate/crossfireAnswer/preview', { token, body: { example: ref } })).status).toBe(404);
  const where = t.db.selectFrom('aiTasks').where('matchId', '=', ref.matchId).where('requestId', '=', ref.requestId);
  const row = await where.select('request').executeTakeFirstOrThrow();
  const { taskTemplate: _saved, ...legacy } = row.request as AiRequest;
  await t.db.updateTable('aiTasks').set({ request: JSON.stringify(legacy) }).where('matchId', '=', ref.matchId).where('requestId', '=', ref.requestId).execute();
  const old = dataOf(await t.call<CatalogPreview>('POST', path + '/preview', { token, body: { example: ref } }));
  expect(old.source).toBeNull();
  expect(old.rendered).toBe(current.rendered);
  expect((await t.call('POST', path + '/preview', { token, body: draft })).status).toBe(400);
  await t.services.traces.remove(ref.matchId);
  expect((await t.call('POST', path + '/preview', { token, body: { example: ref } })).status).toBe(404);
});

it('uses a saved tool instruction on the next invocation', async () => {
  const source = '请返回连接测试结果 {"pong":true}。';
  expect((await t.call('PUT', root + '/system/modelTest', { token, body: { source, revision: 0 } })).status).toBe(200);
  expect((await t.call('POST', '/api/admin/models/' + modelId + '/test', { token })).status).toBe(200);
  expect(calls.at(-1)?.messages[0]?.content).toBe(source);
});
