import { describeEvent, speechOf, type PerspectiveRecord, type PerspectivePrompt, type PrivateActionTemplate } from '@battle/shared';
import { expect, it } from 'vitest';
import { forPlayerSeat } from '../src/modules/realtime/perspective';
import { runUntilSettled } from './support/fixtures';
import { createTestApp, dataOf } from './support/testApp';

it('以保存的事件、当时的阵营和实际私密请求还原 AI、玩家及上帝视角', async () => {
  const t = await createTestApp();
  try {
    const root = '/api/admin/perspectives';
    const token = await t.adminToken();
    const actions = dataOf(await t.call<PrivateActionTemplate[]>('GET', root + '/actions', {token}));
    expect(actions.find(a => a.phase === 'wolf_chat')).toMatchObject({role:'狼人',template:'wolfChat'});
    expect(actions.find(a => a.phase === 'guard_protect')).toMatchObject({role:'守卫',template:'guardProtect',callKeys:['wake.guard']});
    expect(actions.filter(a => a.callKeys.includes('wake.witch')).map(a => a.phase)).toEqual(['witch_save','witch_poison']);
    const match = await t.services.matches.createDebug({gameKey:'werewolf',generatePlayers:true,scripted:true,
      pacing:'free',variant:'nightmare-guard-12',seed:12});
    t.services.worker.start();
    await runUntilSettled(t, match.id);
    const path = root + '/matches/' + match.id;
    expect((await t.call('GET', path)).status).toBe(401);
    const record = dataOf(await t.call<PerspectiveRecord>('GET', path, {token}));
    const first = record.events[0]!;
    const villager = Number(Object.keys(first.roles).find(k => first.roles[Number(k)] === '村民'));
    const wolf = Number(Object.keys(first.roles).find(k => first.roles[Number(k)] === '狼人'));
    const chat = record.events.find(e => e.phase === 'wolf_chat' && e.channel === 'team:werewolf')!;
    expect(chat.aiSeats).toContain(wolf);
    expect(chat.aiSeats).not.toContain(villager);
    expect(chat.playerSeats).toEqual([]);
    expect(chat.spoken).toBe(chat.text);
    expect(chat.aiHistoryText).toContain(chat.text);
    const tally = record.events.find(e => e.phase === 'wolf_kill' && e.channel === 'team:werewolf');
    expect(tally?.spoken).toBeNull();
    const request = record.requests.find(r => r.phase === 'witch_save')!;
    expect(request.instruction).toContain('解药');
    const detail = path + '/requests/' + encodeURIComponent(request.id);
    expect((await t.call('GET', detail)).status).toBe(401);
    expect(dataOf(await t.call<PerspectivePrompt>('GET', detail, {token})).instruction).toBe(request.instruction);
    const notice = record.events.find(e => e.phase === 'witch_save' && e.channel === 'private:' + request.seat)!;
    const stored = (await t.services.repositories.matches.nextEvent(match.id, notice.seq-1))!;
    expect(notice.playerSeats).toEqual([request.seat]);
    expect(notice.aiHistoryText).toBe('主持人：' + notice.text);
    expect(forPlayerSeat(stored,villager)).toBeNull();
    expect(notice.text).toBe(describeEvent(stored).text);
    expect(notice.spoken).toBe(speechOf(stored)?.text);
    await t.services.traces.remove(match.id);
    const cleared = dataOf(await t.call<PerspectiveRecord>('GET',path,{token}));
    expect(cleared.requestsAvailable).toBe(false);
    expect(cleared.requests).toHaveLength(0);
    expect(cleared.events).toEqual(record.events);
    expect((await t.call('GET', detail, {token})).status).toBe(404);
  } finally { await t.cleanup(); }
}, 40000);
