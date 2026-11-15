import { describe, expect, it } from 'vitest';
import type { StageEvent } from '@battle/shared';
import { runToEnd } from '../../../../engine/src/testing';
import { werewolfGame } from '../../../../games/src/werewolf';
import { act, combine, first, play, wolvesKill } from '../../../../games/test/werewolf/helpers';
import { skillCue } from './animation/skillCue';
import { skillRoutes, resultPosition, skillRecipients } from './animation/skillPlan';
import { skillMarks } from './animation/skillMarks';
import { meta, view } from './stage.fixtures';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SkillTargets } from './components/SkillTargets';
import { SeatSkillMarks } from './components/SeatSkillMarks';

const wolfView = { ...view, gameKey: 'werewolf' };
const action = (phaseId: string, targets: number[], text = '施法'): StageEvent => ({ ...meta, view: wolfView, kind: 'action', phaseId, seat: 1, targets, action: '施法', text });

describe('技能交互的可见性与方向', () => {
  it('情侣标记显示已知配对座号，并与翻牌一起提供人物背景大图形', () => {
    const linked = action('cupid_link',[2,7]);
    const flipped: StageEvent = {...meta,view:wolfView,seq:2,kind:'revealed',phaseId:'exile_resolve',text:'白痴翻牌免于放逐',data:{seat:10}};
    const marks = skillMarks([linked,flipped]);
    expect(marks).toContainEqual({seat:2,kind:'bond',label:'情侣 · 7号'});
    expect(marks).toContainEqual({seat:7,kind:'bond',label:'情侣 · 2号'});
    const html = renderToStaticMarkup(createElement(SeatSkillMarks,{marks:marks.filter(mark=>mark.seat===10)}));
    expect(html).toContain('seat-skill-backdrops');
    expect(html).toContain('已翻牌');
    expect(html).toContain('免于放逐 · 失去投票权');
    const couple = renderToStaticMarkup(createElement(SeatSkillMarks,{marks:marks.filter(mark=>mark.seat===2)}));
    expect(couple).toContain('情侣 · 7号');
    expect(couple).toContain('data-kind="bond"');
    expect(renderToStaticMarkup(createElement(SeatSkillMarks,{marks:[]}))).toBe('');
  });
  it('尾巴与命数保留紧凑标记，不误用翻牌大背景', () => {
    const html = renderToStaticMarkup(createElement(SeatSkillMarks,{marks:[{seat:1,kind:'reveal',label:'1命'}]}));
    expect(html).toContain('1命');
    expect(html).not.toContain('seat-skill-backdrops');
    expect(html).not.toContain('已翻牌');
  });
  it('查验结果仅来自事件，绝不从观众视图的真实身份补全', () => {
    const event = action('seer_check', [2], '查验 2号：好人');
    expect(skillCue(event)).toMatchObject({ feedback: '好人', tone: 'good', targets: [2] });
    expect(skillCue({ ...event, view: { ...wolfView, seats: wolfView.seats.map((seat) => ({ ...seat, role: 'witch', roleName: '女巫' })) } })).toEqual(skillCue(event));
    expect(skillCue(action('seer_check', [2], '查验 2号'))?.feedback).toBeUndefined();
    expect(skillCue(action('seer_check', [2], '查验 2号：无法验出'))).toMatchObject({ feedback: '无法验出', tone: 'neutral' });
    expect(skillCue({ ...event, view })).toBeNull();
  });
  it('骑士失败落点是骑士，交换双向、学习从对方返回，缺少坐标不伪造落点', () => {
    const cue = skillCue({ ...meta, view: wolfView, kind: 'revealed', phaseId: 'knight_miss', data: { seat: 1, target: 2 }, text: '骑士失败' })!;
    expect(cue).toMatchObject({ actor: 2, targets: [1], route: 'reflect' });
    const anchors = new Map([[1, { x: 10, y: 50, width: 40, height: 100 }], [2, { x: 200, y: 80, width: 40, height: 100 }]]);
    const centre = { x: 100, y: 100 };
    const swapped = skillRoutes(skillCue(action('magician_swap', [1, 2]))!, anchors, centre);
    expect(swapped.map((route) => [route.from, route.to])).toEqual([[1, 2], [2, 1]]);
    expect(skillRoutes(skillCue(action('spirit_wolf_learn', [2]))!, anchors, centre)[0]).toMatchObject({ from: 2, to: 1 });
    expect(skillRecipients(skillCue(action('spirit_wolf_learn', [2]))!)).toEqual([1]);
    expect(skillRecipients(skillCue(action('big_bad_wolf_decide', [1]))!)).toEqual([]);
    expect(skillRoutes(cue, new Map(), centre)).toEqual([]);
    expect(resultPosition(anchors.get(2)!, { width: 230, height: 180 }, 110).x).toBeLessThanOrEqual(175);
  });
  it('持续状态来自已播放行动，新夜晚清除短期状态，出局清除羁绊', () => {
    const guarded = action('guard_protect', [2]);
    const linked = action('cupid_link', [1, 2]);
    const events: StageEvent[] = [guarded, linked];
    expect(skillMarks(events).map((mark) => mark.kind)).toContain('shield');
    const night: StageEvent = { ...meta, view: wolfView, kind: 'narration', phaseId: 'night_start', text: '新夜晚' };
    expect(skillMarks([...events, night]).every((mark) => mark.kind === 'bond')).toBe(true);
    const death: StageEvent = { ...meta, view: wolfView, kind: 'seat_eliminated', seat: 2, reason: '出局' };
    expect(skillMarks([...events, night, death]).some((mark) => mark.seat === 2)).toBe(false);
  });
  it('范围查验仅展示一份汇总结果，不能把有狼人标到范围中的每个人头上', () => {
    const cue = { kind: 'inspect', title: '查验', actor: 1, targets: [1, 2, 3], route: 'area', feedback: '有狼人' } as const;
    const anchors = { width: 600, height: 400, seats: new Map([1, 2, 3].map((seat) => [seat, { x: seat * 150, y: 150, width: 80, height: 140 }])) };
    const html = renderToStaticMarkup(createElement(SkillTargets, { cue, anchors }));
    expect(html.match(/有狼人/g)).toHaveLength(1);
    expect(html).not.toContain('data-result-for');
  });
  it('天亮才解冻已知的冰冻对象，情侣连锁仅沿已知关系返回出局者', () => {
    const frozen = { ...action('penguin_freeze', [2]), seq: 1 };
    const dawn: StageEvent = { ...meta, seq: 2, view: wolfView, kind: 'narration', phaseId: 'dawn', text: '天亮了，昨晚是平安夜。' };
    expect(skillCue(dawn, [frozen])).toMatchObject({ thaw: [2], feedback: dawn.text });
    expect(skillMarks([frozen, dawn]).some((mark) => mark.kind === 'frost')).toBe(false);
    const linked = { ...action('cupid_link', [2, 3]), seq: 1 };
    const death: StageEvent = { ...meta, seq: 3, view: wolfView, kind: 'revealed', phaseId: 'night_resolve', text: '情侣殉情', data: { effect: 'bond', target: 2, title: '情侣殉情' } };
    expect(skillCue(death, [linked])).toMatchObject({ actor: 3, targets: [2] });
    expect(skillCue(death)).toMatchObject({ actor: null, targets: [2] });
  });
});

describe('真实规则事件的动画契约', () => {
  it.each([[true, false, 'shield'], [false, true, 'heal'], [false, false, 'blade'], [true, true, 'blade']] as const)(
    '守护%s 解药%s 只展示真实结算%s', (protectedSeat, saved, expected) => {
      const board = 'white-wolf-king-guard-12', seed = 11;
      const victim = first(seed, 'villager', board);
      const run = play(seed, combine(wolvesKill(victim, 1),
        act('guard_protect', first(seed, 'guard', board), protectedSeat ? [victim] : [], 1),
        act('witch_save', first(seed, 'witch', board), saved ? [victim] : [], 1)), board);
      const result = run.stageEvents.filter((event) => event.round === 1 && event.kind === 'revealed' && event.data.target === victim);
      expect(result.map((event) => skillCue(event, run.stageEvents)?.kind)).toEqual([expected]);
      expect(result.every((event) => skillCue(event)?.stage === 'result')).toBe(true);
    });
  it('幻术结果飞向实际承伤者，不把原始狼刀选择当成伤亡', () => {
    const board = 'illusionist-wolf-witch-12', seed = 1;
    const caster = first(seed, 'illusionist', board), replacement = first(seed, 'villager', board);
    const run = play(seed, combine(act('illusionist_illusion', caster, [replacement], 1), wolvesKill(caster, 1)), board);
    const hit = run.stageEvents.find((event) => event.round === 1 && event.kind === 'revealed' && event.data.effect === 'blade')!;
    expect(skillCue(hit, run.stageEvents)).toMatchObject({ actor: caster, targets: [replacement], route: 'redirect', stage: 'result' });
  });
  it.each(Object.keys(werewolfGame.spec.variants ?? {}))('%s 的所有真实事件均有合法座位与有限轨迹', (variant) => {
    const run = runToEnd(werewolfGame, { variant, seed: 7 });
    const history: StageEvent[] = [];
    for (const event of run.stageEvents) {
      const cue = skillCue(event, history);
      if (cue) {
        const ids = event.view.seats.map((seat) => seat.seat);
        expect(cue.targets.every((seat) => ids.includes(seat))).toBe(true);
        expect(cue.actor === null || ids.includes(cue.actor)).toBe(true);
        const anchors = new Map(ids.map((seat) => [seat, { x: seat * 50, y: seat % 2 * 200, width: 50, height: 120 }]));
        for (const route of skillRoutes(cue, anchors, { x: 300, y: 150 })) {
          expect(route.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
          expect(route.points[0]).toMatchObject({ x: anchors.get(route.from)!.x, y: anchors.get(route.from)!.y });
          expect(route.points.at(-1)).toMatchObject({ x: anchors.get(route.to)!.x, y: anchors.get(route.to)!.y });
        }
      }
      history.push(event);
    }
  });
});
