import type { AudienceView, StageEvent } from '@battle/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MobileRing } from './components/mobile/MobileRing';
import { MobileSheet } from './components/mobile/MobileSheet';
import { MobileStatus } from './components/mobile/MobileStatus';
import { MobileVersus } from './components/mobile/MobileVersus';
import { followScrollTop } from './hooks/useFollowSpeech';
import { phaseTitle, stageStatus } from './hudStatus';
import { ringPercents } from './layouts/ringGeometry';
import { meta, seat, view } from './stage.fixtures';
import type { StreamItem } from './types';
import { aliveSummary, cycleSpeed, latestRecordLine } from './utils';

const item = (event: StageEvent): StreamItem => ({ event, audio: null });
const werewolf: AudienceView = {
  ...view, gameKey: 'werewolf', title: 'AI 狼人杀', extra: { sheriff: 2 },
  seats: [seat(1, 'werewolf'), seat(2, 'good'), seat(3, 'good'), seat(4, 'lone_wolf')],
};

describe('phone stage helpers', () => {
  it('counts the living per camp only when every camp is visible to the audience', () => {
    expect(aliveSummary(werewolf)).toEqual({ alive: 3, total: 4, camps: [
      { team: 'werewolf', label: '狼人', alive: 1 }, { team: 'good', label: '好人', alive: 1 }, { team: 'lone_wolf', label: '独狼', alive: 1 },
    ] });
    // 玩家视角看不到别人的阵营：只给存活人数，不按部分信息报阵营
    const hidden = { ...werewolf, seats: [...werewolf.seats.slice(0, 3), seat(4, null)] };
    expect(aliveSummary(hidden)).toMatchObject({ alive: 3, camps: [] });
  });

  it('cycles the speed button through every step and back to 1x', () => {
    expect([1, 1.25, 1.5, 2, 3].map(cycleSpeed)).toEqual([1.25, 1.5, 2, 3, 1]);
  });

  it('peeks the latest entry of the chosen record without reading directions', () => {
    const items = [
      item({ ...meta, kind: 'narration', text: '天亮了' }),
      item({ ...meta, seq: 2, kind: 'speech', seat: 1, text: '[冷静]我验了2号[查杀]' }),
      item({ ...meta, seq: 3, kind: 'narration', text: '请投票' }),
    ];
    expect(latestRecordLine(items, true)).toBe('1 号 · 玩家1：我验了2号[查杀]');
    expect(latestRecordLine(items, false)).toBe('请投票');
    expect(latestRecordLine([], true)).toBeNull();
  });

  it('spreads ring seats evenly from the top, clockwise', () => {
    const [top, right, bottom, left] = ringPercents(4, 40);
    expect(top).toMatchObject({ x: 50, y: 10 });
    expect(right!.x).toBeCloseTo(90);
    expect(bottom!.y).toBeCloseTo(90);
    expect(left!.x).toBeCloseTo(10);
  });

  it('keeps the line being read inside the speech card as a long speech plays', () => {
    // 600px 高的文字放在 150px 的卡片里：开头不滚，读到一半时那一行停在卡片上方约 40%，读完停在底部
    expect(followScrollTop(0, 600, 150)).toBe(0);
    expect(followScrollTop(0.5, 600, 150)).toBe(240);
    expect(followScrollTop(1, 600, 150)).toBe(450);
    expect(followScrollTop(0.7, 100, 150)).toBe(0);
  });

  it('never shows an internal phase id as a title', () => {
    expect(phaseTitle({ ...werewolf, phase: { id: 'night_resolve', title: 'night_resolve' } })).toBe('技能结算');
    expect(phaseTitle({ ...werewolf, phase: { id: 'day_speech', title: '白天发言' } })).toBe('白天发言');
  });

  it('reports only day and night for werewolf, and keeps the stage name for debate', () => {
    const night = { ...werewolf, round: 2, extra: { ...werewolf.extra, period: 'night' }, phase: { id: 'night_resolve', title: 'night_resolve' } };
    const day = { ...werewolf, round: 3, extra: { ...werewolf.extra, period: 'day' }, phase: { id: 'day_speech', title: '白天发言' } };
    expect(stageStatus(night)).toBe('第 2 夜');
    expect(stageStatus(day)).toBe('第 3 天');
    expect(stageStatus({ ...day, status: 'completed' })).toBe('对局已结束');
    expect(stageStatus({ ...day, gameKey: 'debate', round: 1, phase: { id: 'cross', title: '攻辩' } })).toBe('第 1 轮 · 攻辩');
    expect(stageStatus(null)).toBe('准备中');
  });
});

describe('phone stage components', () => {
  const noop = () => {};

  it('marks the speaker, the dead, the sheriff and wolves on the ring', () => {
    const html = renderToStaticMarkup(<MobileRing view={werewolf} speaking={2} selected={null} onSelect={noop} center={<span>桌心</span>} />);
    expect(html.match(/<button[^>]*class="mobile-seat/g)).toHaveLength(4);
    expect(html).toContain('mobile-seat is-speaking');
    expect(html).toContain('mobile-seat is-out');
    expect(html).toContain('mobile-seat-badge');
    expect(html).toContain('data-team="werewolf"');
    expect(html).toContain('桌心');
  });

  it('puts debaters in their own columns and judges on the bench', () => {
    const html = renderToStaticMarkup(<MobileVersus view={view} speaking={null} selected={null} onSelect={noop} center={null} />);
    expect(html.indexOf('aria-label="正方"')).toBeLessThan(html.indexOf('1号 玩家1'));
    expect(html.indexOf('aria-label="评委席"')).toBeLessThan(html.indexOf('3号 玩家3'));
  });

  it('shows the status strip with the sheriff', () => {
    const html = renderToStaticMarkup(<MobileStatus view={werewolf} />);
    expect(html).toContain('存活 <b>3</b>/4');
    expect(html).toContain('警长 <b>2号</b>');
  });

  it('peeks the last finished entry when collapsed and the selected seat when open on the seat tab', () => {
    const played = [item({ ...meta, kind: 'speech', seat: 1, text: '上一句' })];
    const current = item({ ...meta, seq: 2, kind: 'speech', seat: 2, text: '正在说的' });
    const closed = renderToStaticMarkup(<MobileSheet open={false} tab="speech" items={[...played, current]} history={played} seat={null} seatSpeeches={[]} onTab={noop} onToggle={noop} />);
    expect(closed).toContain('上一句');
    expect(closed).not.toContain('正在说的');
    const open = renderToStaticMarkup(<MobileSheet open tab="seat" items={played} history={played} seat={werewolf.seats[1]!} seatSpeeches={[]} onTab={noop} onToggle={noop} />);
    expect(open).toContain('id="mobile-seat-name"');
    expect(open).toContain('还没有公开发言');
  });
});
