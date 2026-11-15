import { describe, expect, it } from 'vitest';
import { act, combine, entries, everyoneVotes, first, play, requestsIn, wolvesKill } from './helpers';

type Game = ReturnType<typeof play>;

function publicNight(run: Game, round: number) {
  return run.stageEvents.filter((e) => e.round === round && e.channel === 'public' && e.view.extra.period === 'night')
    .map((e) => ({ phase: e.phaseId, title: e.kind === 'phase_started' ? e.title : null,
      text: e.kind === 'phase_started' ? e.announcement : e.kind === 'narration' ? e.text : undefined }));
}

function calls(run: Game, round: number) {
  return publicNight(run, round).flatMap(({ text }) => text ? [text] : []);
}

const seerCall = '预言家请睁眼，查验身份。';
const standard = ['天黑请闭眼。', '狼人请睁眼，选择目标。', seerCall, '女巫请睁眼行动。'];

describe('狼人杀法官播报', () => {
  it('同一板子在预言家出局、女巫用药后仍按原顺序叫号', () => {
    const seed = 11;
    const seer = first(seed, 'seer');
    const villager = first(seed, 'villager');
    const run = play(seed, combine(wolvesKill(villager), act('witch_save', null, [villager], 1), everyoneVotes('exile_vote', seer, 1)));
    expect(requestsIn(run, 'seer_check')).toHaveLength(1);
    expect(calls(run, 1)).toEqual(standard);
    expect(calls(run, 2)).toEqual(standard);
    expect(publicNight(run, 2)).toEqual(publicNight(play(seed), 2));
  });

  it('用药询问只在女巫真正可以选择时出现，并排在她作答前', () => {
    const victim = first(11, 'villager');
    const witch = first(11, 'witch');
    const saved = play(11, combine(wolvesKill(victim, 1), wolvesKill(victim, 2), act('witch_save', witch, [victim], 1)));
    const notices = (run: Game, round: number) => run.stageEvents.filter((e) =>
      e.round === round && e.kind === 'narration' && e.purpose === 'decision');
    const save = notices(saved, 1);
    expect(save).toHaveLength(1);
    expect(save[0]).toMatchObject({ channel: `private:${witch}`, text: `今晚被狼人袭击的是${victim}号。要使用解药吗？` });
    const decision = entries(saved, 'action', 'witch_save')[0]!;
    expect(save[0]!.seq).toBeLessThan(decision.seq);
    expect(notices(saved, 2).map((e) => e.phaseId)).toEqual(['witch_poison']);
    const declined = play(11, wolvesKill(victim));
    expect(notices(declined, 1).map((e) => e.phaseId)).toEqual(['witch_save', 'witch_poison']);
    expect(publicNight(declined, 1)).toEqual(publicNight(saved, 1));
    const board = 'nightmare-guard-12';
    const blocked = play(12, act('nightmare_fear', null, [first(12, 'witch', board)], 1), board);
    expect(notices(blocked, 1)).toEqual([]);
    expect(calls(blocked, 1)).toContain('女巫请睁眼行动。');
  });

  it('预言家被封锁时仍公开叫号，只有可以行动的预言家收到请求并回传目标', () => {
    const board = 'nightmare-guard-12';
    const seed = 12;
    const seer = first(seed, 'seer', board);
    const wolf = first(seed, 'werewolf', board);
    const active = play(seed, act('seer_check', seer, [wolf], 1), board);
    const blocked = play(seed, act('nightmare_fear', null, [seer], 1), board);
    expect(publicNight(blocked, 1)).toEqual(publicNight(active, 1));
    expect(calls(blocked, 1).filter(text => text === seerCall)).toHaveLength(1);
    expect(active.requests.filter(({ request, snapshot }) => snapshot.round === 1 && request.phaseId === 'seer_check')
      .map(({ request }) => request.seat)).toEqual([seer]);
    expect(entries(active, 'action', 'seer_check')[0]).toMatchObject({
      round: 1, channel: `private:${seer}`, targets: [wolf], text: `查验 ${wolf}号：狼人`,
    });
    expect(blocked.requests.some(({ request, snapshot }) => snapshot.round === 1 && request.phaseId === 'seer_check')).toBe(false);
    expect(entries(blocked, 'action', 'seer_check').some(entry => entry.round === 1)).toBe(false);
  });

  it('狼队被封锁时，公开标题和叫号都一致，狼人没有实际行动', () => {
    const board = 'nightmare-guard-12';
    const wolf = first(12, 'werewolf', board);
    const blocked = play(12, act('nightmare_fear', null, [wolf], 1), board);
    expect(blocked.requests.some(({ request, snapshot }) => snapshot.round === 1 && request.phaseId === 'wolf_kill')).toBe(false);
    expect(publicNight(blocked, 1)).toEqual(publicNight(play(12, undefined, board), 1));
    expect(calls(blocked, 1)).toEqual([standard[0], '梦魇请睁眼，选择恐惧目标。', '守卫请睁眼行动。', ...standard.slice(1)]);
  });

  it('盗贼压在底牌时仍首夜叫号，灵狼板的预言家排在灵狼后面', () => {
    const board = 'cupid-thief-12';
    const undealt = play(4, undefined, board);
    expect(requestsIn(undealt, 'thief_choose')).toHaveLength(0);
    expect(calls(undealt, 1)).toEqual(calls(play(1, undefined, board), 1));
    expect(calls(undealt, 1)).toEqual([standard[0], '盗贼请睁眼，选择底牌。', '丘比特请睁眼，连接情侣。', ...standard.slice(1)]);
    expect(calls(undealt, 2)).toEqual(standard);
    const spirit = play(1, undefined, 'spirit-wolf-12');
    const order = ['天黑请闭眼。', '守卫请睁眼行动。', '狼人请睁眼，选择目标。', '女巫请睁眼行动。', '灵狼请睁眼，学习技能。', seerCall];
    expect(calls(spirit, 1)).toEqual(order);
    expect(calls(spirit, 2)).toEqual([...order.slice(0, -2), '灵狼请睁眼行动。', seerCall]);
  });

  it('新娘板私聊按公开称呼叫醒新郎和证婚人，不报座位和选人的结果', () => {
    const run = play(1, undefined, 'ghost-bride-thief-12');
    expect(calls(run, 1)).toContain('新郎、证婚人请睁眼，与新娘交流。');
    expect(calls(run, 2)).toContain('新娘、新郎、证婚人请睁眼，开始夜聊。');
    expect(calls(run, 1).every((line) => !line.includes('号'))).toBe(true);
  });

  it('首日先睁眼上警再报死讯，遗言、首位发言、放逐和次日睁眼均跟随实际流程', () => {
    const seed = 11;
    const out = first(seed, 'villager');
    const run = play(seed, wolvesKill(out));
    const day = run.stageEvents.filter((e) => e.round === 1 && e.channel === 'public');
    const lines = day.map((e) => e.kind === 'phase_started' ? e.announcement : 'text' in e ? e.text : undefined);
    const firstSpeaker = entries(run, 'speech', 'day_speech')[0]!;
    const ordered = [
      '天亮请睁眼。上警的玩家请举手。', '本局无警长。',
      `昨晚${out}号出局。`, `${out}号，请发表遗言。`, entries(run, 'speech', 'last_words')[0]!.text,
      `请${firstSpeaker.seat}号先发言。`, firstSpeaker.text,
      '请投放逐票。', '全员弃票，本轮无人出局。',
    ];
    const positions = ordered.map((text) => lines.indexOf(text));
    expect(positions[0]).toBeGreaterThan(-1);
    expect(positions.every((pos, i) => i === 0 || pos > positions[i - 1]!)).toBe(true);
    expect(lines.filter((line) => line?.includes('天亮请睁眼'))).toHaveLength(1);
    expect(entries(run, 'narration', 'dawn')[1]?.text).toBe('天亮请睁眼。昨晚是平安夜。');
  });

  it('普通放逐只播一次；自爆跳过当天放逐；胜负在遗言之后宣布', () => {
    const seed = 11;
    const wolf = first(seed, 'werewolf');
    const run = play(seed, (request, snapshot) => {
      const nextWolf = snapshot.seats.find((s) => s.alive && s.team === 'werewolf');
      return nextWolf ? everyoneVotes('exile_vote', nextWolf.seat)(request, snapshot) : undefined;
    });
    const voices = run.stageEvents.flatMap((e) => e.channel === 'public' && 'text' in e ? [e.text] : []);
    expect(voices.filter((s) => s === `${wolf}号玩家被放逐，请发表遗言。`)).toHaveLength(1);
    const lastWords = entries(run, 'phase_started', 'last_words')[0];
    expect(lastWords).toBeDefined();
    expect(lastWords?.announcement).toBeFalsy();
    expect(entries(run, 'speech', 'last_words')[0]?.seat).toBe(wolf);
    const winner = voices.findIndex((s) => s.startsWith('游戏结束，好人阵营胜利'));
    expect(winner).toBeGreaterThan(voices.lastIndexOf(entries(run, 'speech', 'last_words').at(-1)!.text));
    expect(run.stageEvents.at(-1)?.view.extra.winnerAnnounced).toBe(true);
    const blast = play(seed, (r, s) => r.phaseId === 'day_speech' && r.seat === wolf && s.round === 1
      ? { speech: '过。', declare: 'selfDestruct' } : undefined);
    const firstDay = blast.stageEvents.filter((e) => e.round === 1);
    expect(firstDay.filter((e) => e.kind === 'action' && e.action === '自爆')).toMatchObject([
      { seat: wolf, text: `${wolf}号自爆，直接进入黑夜。` },
    ]);
    expect(firstDay.some((e) => e.phaseId === 'self_destruct' && e.kind === 'narration')).toBe(false);
    expect(firstDay.some((e) => e.phaseId === 'exile_vote')).toBe(false);
  });
});
