import type { AiRequest } from '@battle/engine';
import type { PromptComparisonContext, PromptComparisonRecord } from '@battle/shared';
import { gameRegistry } from '@battle/games';
import { readMatchPrompts } from '../src/modules/prompt-catalog/settingsRepository';
import { expect, it } from 'vitest';
import { answerFor, runUntilSettled, seedPlayers } from './support/fixtures';
import { createTestApp, dataOf } from './support/testApp';

it('调试台应用只影响新建对局，同一板子的在途请求和后续轮次沿用开局版本', async () => {
  let reachedAnswer!: () => void;
  let releaseAnswer!: () => void;
  const ready = new Promise<void>(r => { reachedAnswer = r; });
  const gate = new Promise<void>(r => { releaseAnswer = r; });
  let waiting = true;
  const t = await createTestApp({}, { llm: { complete: async req => {
    if (waiting && req.messages.at(-1)?.content.includes('你是回答方')) {
      waiting = false; reachedAnswer(); await gate;
    }
    return { content: answerFor(req), usage: null };
  } } });
  try {
    const token = await t.adminToken();
    const ids = await seedPlayers(t, 9);
    t.services.worker.start();
    const match = await t.services.matches.createDebug({ gameKey: 'debate', playerIds: ids, pacing: 'free', seed: 15 });
    await ready;
    const tasks = async (id: string) => (await t.db.selectFrom('aiTasks').select('request')
      .where('matchId', '=', id).execute()).map(row => row.request as AiRequest);
    const before = await tasks(match.id);
    const first = before.find(q => q.phaseId === 'crossfire' && q.taskTemplate?.source.includes('{{turn.targetLabel}}'))!;
    const trace = await t.services.traces.overview(match.id);
    const call = trace.calls.find(c => c.requestId === first.id)!;
    const path = `/api/admin/traces/${match.id}/requests/${encodeURIComponent(first.id)}/comparisons`;
    const ctx = dataOf(await t.call<PromptComparisonContext>('GET', path, {token}));
    expect(ctx.template?.name).toBe(first.taskTemplate!.name);
    const draft = { persona: ctx.persona, instruction: ctx.instruction, taskTemplate: '向{{turn.targetLabel}}追问一个例子。', model: {callId: call.id} };
    expect((await t.call('POST',path,{token,body:{...draft,taskTemplate:'{{turn.doesNotExist}}'}})).status).toBe(400);
    const trial = dataOf(await t.call<PromptComparisonRecord>('POST', path, { token, body: draft }));
    expect(trial.draft.instruction).toContain(String((first.taskTemplate!.context.turn as {targetLabel:string}).targetLabel));
    expect(await t.db.selectFrom('appliedPrompts').selectAll().execute()).toEqual([]);
    const publish = path + '/' + trial.id + '/apply';
    expect((await t.call('POST', publish)).status).toBe(401);
    const wrongPath = publish.replace(encodeURIComponent(first.id), 'another-request');
    expect((await t.call('POST', wrongPath, {token})).status).toBe(404);
    expect((await t.call('POST', publish, {token})).status).toBe(200);
    expect((await t.call('POST', publish, {token})).status).toBe(200);
    expect(await tasks(match.id)).toEqual(before);
    releaseAnswer();
    await runUntilSettled(t,match.id);
    const after = await tasks(match.id);
    const other = after.find(q => q.id !== first.id && q.taskTemplate?.name === first.taskTemplate!.name)!;
    expect(other.prompt.instruction).toContain('现在是攻辩环节');
    expect(after.every(q => !q.taskTemplate?.applied)).toBe(true);
    // 已有的记录只有渲染结果和节点里的模板名。
    const { taskTemplate: omitted, ...legacy } = first;
    await t.db.updateTable('aiTasks').set({ request: JSON.stringify(legacy) }).where('matchId','=',match.id)
      .where('requestId','=',first.id).execute();
    const legacyContext = dataOf(await t.call<PromptComparisonContext>('GET', path, {token}));
    expect(legacyContext.template).toMatchObject({ name: omitted!.name, source: '{{originalTask}}' });
    expect(legacyContext.activeComparisonId).toBe(trial.id);
    const legacyTrial = dataOf(await t.call<PromptComparisonRecord>('POST', path, {
      token, body: { ...draft, taskTemplate: '{{originalTask}} 请追问证据。' },
    }));
    expect(legacyTrial.draft.instruction).toBe(first.prompt.instruction + ' 请追问证据。');
    const next = await t.services.matches.createDebug({ gameKey:'debate',playerIds:ids,pacing:'free',seed:16 });
    await runUntilSettled(t,next.id);
    const questions = (await tasks(next.id)).filter(q => q.taskTemplate?.name === first.taskTemplate!.name);
    expect(questions.length).toBeGreaterThan(1);
    for (const q of questions) {
      expect(q.taskTemplate?.applied?.source).toBe(draft.taskTemplate);
      const { targetLabel } = q.taskTemplate!.context.turn as { targetLabel: string };
      expect(q.prompt.instruction).toBe('向' + targetLabel + '追问一个例子。');
    }
    const game = gameRegistry.get('debate')!;
    const pinned = (variant: string | null) => readMatchPrompts(t.db, game, variant);
    expect((await pinned('another-board')).promptSet.trials).toEqual({});
    const general = '目录新版：{{turn.targetLabel}}';
    expect((await t.call('PUT', '/api/admin/prompts/debate/crossfireQuestion', { token,
      body: { revision: 0, source: general } })).status).toBe(200);
    expect((await pinned(null)).promptSet.trials).toEqual({});
    expect((await pinned(null)).promptSet.sources.crossfireQuestion).toBe(general);
    expect(dataOf(await t.call<PromptComparisonContext>('GET', path, { token })).activeComparisonId).toBeNull();
    expect((await t.call('POST', publish, { token })).status).toBe(200);
    await t.services.traces.remove(match.id);
    expect((await pinned(null)).promptSet.trials.crossfireQuestion?.source).toBe(draft.taskTemplate);
  } finally { releaseAnswer(); await t.cleanup(); }
}, 30000);
