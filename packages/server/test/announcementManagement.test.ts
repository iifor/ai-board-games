import { werewolfAnnouncements } from '@battle/games';
import { announcementProblem, speechOf, type AnnouncementItem, type StageEvent } from '@battle/shared';
import { expect, it } from 'vitest';
import { forPlayerSeat } from '../src/modules/realtime/perspective';
import { runUntilSettled } from './support/fixtures';
import { createTestApp, dataOf } from './support/testApp';

it('保存与恢复按开局生效，私讯只发给当事座位，历史事件保留原文', async () => {
  const t = await createTestApp();
  const path = '/api/admin/announcements';
  try {
    expect((await t.call('GET', path)).status).toBe(401);
    const token = await t.adminToken();
    const list = async () => dataOf(await t.call<AnnouncementItem[]>('GET', path, { token }));
    const save = (key: string, text: string | null, revision = 0) => t.call<AnnouncementItem>('PUT', path + '/' + key, { token, body: { text, revision } });
    const items = await list();
    expect(items).toHaveLength(werewolfAnnouncements.length + 1);
    expect(new Set(items.map(item => item.key)).size).toBe(items.length);
    expect(items.filter(item => !item.engineTemplate).every(item => item.customText === null && !announcementProblem(item.defaultText, item.examples))).toBe(true);
    expect((await save('wake', '{座号}')).status).toBe(400);
    expect((await save('witchSave', '救人吗？')).status).toBe(400);
    expect((await save('witchSave', '{{座号}}')).status).toBe(400);
    expect((await save('wake', '  ')).status).toBe(400);
    expect((await save('unknown', '无效')).status).toBe(404);
    const variants = await Promise.all([save('wake', '请大家睁开眼睛'), save('wake', '请各位睁开眼睛')]);
    expect(variants.map(r => r.status).sort()).toEqual([200, 409]);
    const wake = dataOf(variants.find(r => r.status === 200)!).customText!;
    expect(dataOf(await save('nightFalls', '请闭上双眼。')).revision).toBe(1);
    expect((await save('wake.witch', '请女巫睁开眼睛。')).status).toBe(200);
    expect((await save('witchSave', '{座号}号遇袭，要救人吗？')).status).toBe(200);
    expect((await list()).find(row => row.key === 'wake')?.customText).toBe(wake);

    // 两局同种子。第一局已创建但还有待决行动，此时恢复默认。
    const create = () => t.services.matches.createDebug({ gameKey: 'werewolf', generatePlayers: true, scripted: true, seed: 5, pacing: 'free' });
    const customized = await create();
    for (const key of ['wake', 'nightFalls', 'wake.witch', 'witchSave']) expect(dataOf(await save(key, null, 1)).customText).toBeNull();
    expect((await save('wake', '过期的改动', 1)).status).toBe(409);
    t.services.worker.start();
    await runUntilSettled(t, customized.id);
    const original = await create();
    await runUntilSettled(t, original.id);
    const events = async (id: string) => (await t.db.selectFrom('matchStageEvents').select('event')
      .where('matchId', '=', id).orderBy('seq').execute()).map(row => row.event as StageEvent);
    const custom = await events(customized.id);
    const builtIn = await events(original.id);
    const words = (events: StageEvent[]) => events.map(e => speechOf(e)?.text ?? '');
    expect(words(custom)).toContain('请闭上双眼。');
    expect(words(custom)).toContain('请女巫睁开眼睛。');
    expect(words(custom)).toContain(wake + '。上警的玩家请举手。');
    expect(custom.some(e => e.round > 1 && e.phaseId === 'dawn' && speechOf(e)?.text.startsWith(wake))).toBe(true);
    const notice = custom.find(e => e.kind === 'narration' && e.phaseId === 'witch_save' && e.purpose === 'decision')!;
    expect(speechOf(notice)?.text).toMatch(/^\d+号遇袭，要救人吗？$/);
    const witch = notice.view.seats.find(s => s.role === 'witch')!.seat;
    expect(forPlayerSeat(notice, witch)).not.toBeNull();
    expect(forPlayerSeat(notice, notice.view.seats.find(s => s.role === 'villager')!.seat)).toBeNull();
    expect(words(builtIn)).toContain('天亮请睁眼。上警的玩家请举手。');
    expect(words(builtIn)).toContain('天黑请闭眼。');
    expect(words(builtIn)).toContain('女巫请睁眼行动。');
    expect(builtIn.at(-1)?.kind).toBe('game_over');
    expect(custom.at(-1)?.view.result).toEqual(builtIn.at(-1)?.view.result);
  } finally {
    await t.cleanup();
  }
}, 60000);

it('辩题播报沿用旧文案和修订号，用本局公开辩题渲染而不发起 AI 请求', async () => {
  const t = await createTestApp();
  try {
    const token = await t.adminToken();
    const root = '/api/admin/announcements';
    const path = root + '/debate.topicAnnounce';
    const old = '今日辩题：{{state.topic.title}}';
    await t.db.insertInto('promptTemplates').values({ gameKey: 'debate', templateName: 'topicAnnounce', source: old, revision: 3 }).execute();
    const list = dataOf(await t.call<AnnouncementItem[]>('GET', root, { token }));
    expect(list.find(item => item.key === 'debate.topicAnnounce')).toMatchObject({ customText: old, revision: 3, engineTemplate: true });
    const text = '正方：{{state.topic.pro}}。反方：{{state.topic.con}}。';
    const preview = dataOf(await t.call<{ text: string }>('POST', path + '/preview', { token, body: { text } }));
    expect(preview.text).toMatch(/^正方：[^{}]+。反方：[^{}]+。$/);
    const save = (text: string | null, revision: number) => t.call<AnnouncementItem>('PUT', path, { token, body: { text, revision } });
    expect((await save('{{me.role}}', 3)).status).toBe(400);
    expect((await save(text, 2)).status).toBe(409);
    const start = () => t.services.matches.createDebug({ gameKey: 'debate', generatePlayers: true, scripted: true, pacing: 'free',
      params: { topic: { title: '远程办公', pro: '支持', con: '反对' } } });
    const a = await start();
    expect(dataOf(await save(text, 3)).revision).toBe(4);
    const b = await start();
    const firstLine = async (id: string) => {
      const rows = await t.db.selectFrom('matchStageEvents').select('event').where('matchId', '=', id).orderBy('seq').execute();
      return rows.map(r => r.event as StageEvent).find(e => e.phaseId === 'topic_reveal' && e.kind === 'narration');
    };
    expect(await firstLine(a.id)).toMatchObject({ text: '今日辩题：远程办公' });
    expect(await firstLine(b.id)).toMatchObject({ text: '正方：支持。反方：反对。' });
    const queued = await t.db.selectFrom('aiTasks').select('requestId').where('matchId', '=', b.id).execute();
    expect(queued.length).toBeGreaterThan(0);
    expect(queued.every(r => r.requestId.startsWith('opening#'))).toBe(true);
    expect(dataOf(await save(null, 4)).customText).toBeNull();
  } finally { await t.cleanup(); }
});
