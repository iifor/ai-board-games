import type { AiRequest } from '@battle/engine';
import type { CatalogPreview, MatchSummaryDto, PromptCatalogDetail, PromptCatalogItem } from '@battle/shared';
import { expect, it } from 'vitest';
import { createTestApp, dataOf } from './support/testApp';
import { seedPlayers } from './support/fixtures';

it('公开开局时固定规则、身份、任务和平台模板，行动时按实际座位填变量', async () => {
  const t = await createTestApp();
  try {
    const token = await t.adminToken();
    const playerIds = await seedPlayers(t, 9);
    const create = async () => dataOf(await t.call<MatchSummaryDto>('POST', '/api/toc/matches', { token: (await t.access()).token, body: { gameKey: 'debate', playerIds } }));
    const old = await create();
    const save = (key: string, source: string, revision = 0) => t.call('PUT', '/api/admin/prompts/' + key, { token, body: { source, revision } });
    const source = '请{{me.label}}向{{turn.targetLabel}}提一个问题。';
    const key = 'debate/crossfireQuestion';
    const path = '/api/admin/prompts/' + key;
    expect((await t.call('PUT', path, { body: { source, revision: 0 } })).status).toBe(401);
    expect((await save(key, '{{turn.doesNotExist}}')).status).toBe(400);
    expect((await save(key, source)).status).toBe(200);
    expect((await save(key, '过时的版本')).status).toBe(409);
    expect((await save('debate/rules', '本局辩题：{{state.topic.title}}')).status).toBe(200);
    expect((await save('debate/proDebater', '正方选手 {{me.label}}')).status).toBe(200);
    expect((await save('system/platform', '请遵守《{{title}}》的规则。')).status).toBe(200);
    const expression = '可以用 [读法] 表达你当时的语气。';
    const expressionPath = '/api/admin/prompts/system/playerExpression';
    const catalog = dataOf(await t.call<PromptCatalogItem[]>('GET', '/api/admin/prompts', { token }));
    expect(catalog).toContainEqual(expect.objectContaining({ group: 'system', key: 'playerExpression', title: '玩家发言与情绪表达' }));
    const expressionDetail = dataOf(await t.call<PromptCatalogDetail>('GET', expressionPath, { token }));
    const preview = dataOf(await t.call<CatalogPreview>('POST', expressionPath + '/preview', {
      token, body: { example: expressionDetail.examples[0]!.ref, source: expression },
    }));
    expect(preview.draft).toBe(expression);
    expect(preview.rendered).toBe(expressionDetail.defaultSource);
    expect((await save('system/playerExpression', expression)).status).toBe(200);
    const detail = dataOf(await t.call<PromptCatalogDetail>('GET', path, { token }));
    expect(detail).toMatchObject({ source, revision: 1 });
    const view = dataOf(await t.call<CatalogPreview>('POST', path + '/preview', { token, body: { example: { kind: 'example', index: 0 } } }));
    expect(view.source).toBe(source);
    expect(view.rendered).toMatch(/^请.+向.+提一个问题。$/);
    const fresh = await create();
    expect(fresh).not.toHaveProperty('promptSet');
    // 两局都已开局但都尚未到攻辩。后续即使再次保存，也不能改变任一局。
    expect((await save(key, '第三版', 1)).status).toBe(200);
    expect((await save('system/playerExpression', '新一版发言指引', 1)).status).toBe(200);
    async function reachQuestion(id: string) {
      for (let turn = 0; turn < 12; turn++) {
        const snapshot = await t.services.repositories.matches.snapshot(id);
        const pending = snapshot!.pending[0]!;
        const row = await t.db.selectFrom('aiTasks').select('request').where('matchId', '=', id)
          .where('requestId', '=', pending.id).executeTakeFirstOrThrow();
        const request = row.request as AiRequest;
        if (request.taskTemplate?.name === 'crossfireQuestion') return request;
        await t.services.runtime.advanceMatch(id, { kind: 'ai_result', requestId: pending.id, output: { speech: '我的论点。' } });
      }
      throw new Error('对局未到达攻辩提问');
    }
    const a = await reachQuestion(old.id), b = await reachQuestion(fresh.id);
    expect(a.prompt.instruction).toContain('现在是攻辩环节');
    expect(a.prompt.rules).toContain('这是一场 AI 辩论赛');
    expect(a.prompt.identity).toContain('用符合你人设的口吻');
    expect(b.prompt.identity).toContain(expression);
    expect(b.prompt.identity).not.toContain('用符合你人设的口吻');
    expect(b.taskTemplate?.source).toBe(source);
    const turn = b.taskTemplate!.context.turn as { targetLabel: string };
    const me = b.taskTemplate!.context.me as { label: string };
    expect(b.prompt.instruction).toBe(`请${me.label}向${turn.targetLabel}提一个问题。`);
    expect(b.prompt.identity).toContain('正方选手 ' + me.label);
    expect(b.prompt.platform).toBe('请遵守《AI 辩论赛》的规则。');
    expect(b.prompt.rules).toMatch(/^本局辩题：.+/);
  } finally { await t.cleanup(); }
});
