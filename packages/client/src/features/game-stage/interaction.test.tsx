import type { StageEvent } from '@battle/shared';
import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlaybackControls } from './components/PlaybackControls';
import { SeatCard } from './components/SeatCard';
import { SeatPopover } from './components/SeatPopover';
import { meta, seat, view } from './stage.fixtures';
import type { PlaybackOptions, SeatSpeech, ShortcutKeyLike, StreamItem } from './types';
import { applyShortcut, popoverPlacement, shortcutActionOf, speechesOfSeat, stepSpeed } from './utils';

const press = (key: string, extra: Partial<ShortcutKeyLike> = {}): ShortcutKeyLike => ({ key, ctrlKey: false, metaKey: false, altKey: false, target: null, ...extra });
const options: PlaybackOptions = { speed: 1.5, paused: false, muted: false };

describe('stage shortcuts', () => {
  it('maps the playback keys to actions and ignores everything else', () => {
    expect(shortcutActionOf(press(' '))).toBe('toggle-pause');
    expect(shortcutActionOf(press('ArrowLeft'))).toBe('speed-down');
    expect(shortcutActionOf(press('ArrowRight'))).toBe('speed-up');
    expect(shortcutActionOf(press('m'))).toBe('toggle-mute');
    expect(shortcutActionOf(press('M'))).toBe('toggle-mute');
    expect(shortcutActionOf(press('l'))).toBe('toggle-feed');
    expect(shortcutActionOf(press('R'))).toBe('toggle-result');
    // Escape 由终局对话框与座位弹层各自处理，快捷键不碰
    expect(shortcutActionOf(press('Escape'))).toBeNull();
    expect(shortcutActionOf(press('Enter'))).toBeNull();
    expect(shortcutActionOf(press('a'))).toBeNull();
  });

  it('stays quiet with a modifier held or when the focus is in a field', () => {
    expect(shortcutActionOf(press(' ', { ctrlKey: true }))).toBeNull();
    expect(shortcutActionOf(press('m', { metaKey: true }))).toBeNull();
    expect(shortcutActionOf(press('ArrowLeft', { altKey: true }))).toBeNull();
    expect(shortcutActionOf(press('m', { target: { tagName: 'INPUT' } }))).toBeNull();
    expect(shortcutActionOf(press(' ', { target: { tagName: 'textarea' } }))).toBeNull();
    expect(shortcutActionOf(press('l', { target: { tagName: 'SELECT' } }))).toBeNull();
    expect(shortcutActionOf(press('l', { target: { tagName: 'DIV', isContentEditable: true } }))).toBeNull();
    expect(shortcutActionOf(press('l', { target: { tagName: 'DIV', isContentEditable: false } }))).toBe('toggle-feed');
  });

  it('leaves Space to a focused button (native activation) but still handles the other keys there', () => {
    const button = { tagName: 'BUTTON' };
    expect(shortcutActionOf(press(' ', { target: button }))).toBeNull();
    expect(shortcutActionOf(press('m', { target: button }))).toBe('toggle-mute');
    expect(shortcutActionOf(press('ArrowRight', { target: button }))).toBe('speed-up');
    expect(shortcutActionOf(press(' ', { target: { tagName: 'A' } }))).toBe('toggle-pause');
  });

  it('steps through the speeds the controls offer and clamps at both ends', () => {
    expect(stepSpeed(1, -1)).toBe(1);
    expect(stepSpeed(1, 1)).toBe(1.5);
    expect(stepSpeed(1.5, 1)).toBe(2);
    expect(stepSpeed(2, 1)).toBe(3);
    expect(stepSpeed(3, 1)).toBe(3);
    expect(stepSpeed(3, -1)).toBe(2);
    expect(stepSpeed(1.2, 1)).toBe(1.5);
    expect(stepSpeed(1.2, -1)).toBe(1);
  });

  it('applies a shortcut to the playback options and hands the others back', () => {
    expect(applyShortcut('toggle-pause', options)).toEqual({ ...options, paused: true });
    expect(applyShortcut('toggle-mute', { ...options, muted: true })).toEqual({ ...options, muted: false });
    expect(applyShortcut('speed-up', options)).toEqual({ ...options, speed: 2 });
    expect(applyShortcut('speed-down', options)).toEqual({ ...options, speed: 1 });
    expect(applyShortcut('toggle-feed', options)).toBeNull();
    expect(applyShortcut('toggle-result', options)).toBeNull();
  });

  it('labels the controls with their shortcuts without adding a live region', () => {
    const html = renderToStaticMarkup(<PlaybackControls options={options} pending={0} finished={false} feedOpen={false} onChange={() => {}} onToggleFeed={() => {}} />);
    expect(html).toContain('aria-keyshortcuts="Space"');
    expect(html).toContain('title="暂停 / 继续（空格）"');
    expect(html).toContain('aria-keyshortcuts="ArrowLeft ArrowRight"');
    expect(html).toContain('aria-keyshortcuts="M"');
    expect(html).toContain('aria-keyshortcuts="L"');
    expect(html).not.toContain('aria-live');
  });
});

describe('seat popover', () => {
  const item = (event: StageEvent): StreamItem => ({ event, audio: null });
  const later = { ...view, round: 2, phase: { id: 'rebuttal', title: '驳论' } };
  const played: readonly StreamItem[] = [
    item({ ...meta, kind: 'speech', seat: 1, text: '我方认为' }),
    item({ ...meta, seq: 2, kind: 'speech', seat: 2, text: '对方辩友' }),
    item({ ...meta, seq: 3, kind: 'judgement', seat: 3, verdict: 'pro', verdictLabel: '正方胜', comment: '论证完整' }),
    item({ ...meta, seq: 4, kind: 'action', seat: 1, action: 'shoot', targets: [2], text: '开枪' }),
    item({ ...meta, seq: 5, round: 2, phaseId: 'rebuttal', kind: 'speech', seat: 1, text: '再补充一点', view: later }),
    item({ ...meta, seq: 6, kind: 'speech', seat: 1, text: '没有阶段', view: { ...view, phase: null } }),
  ];

  it('collects a seat\'s public speeches and judgements in play order with their round and phase', () => {
    expect(speechesOfSeat(played, 1)).toEqual([
      { seq: 1, kind: 'speech', title: '第 1 轮 · 立论', text: '我方认为' },
      { seq: 5, kind: 'speech', title: '第 2 轮 · 驳论', text: '再补充一点' },
      { seq: 6, kind: 'speech', title: '第 1 轮', text: '没有阶段' },
    ]);
    // 判定文本与字幕同口径："判定。点评"
    expect(speechesOfSeat(played, 3)).toEqual([{ seq: 3, kind: 'judgement', title: '第 1 轮 · 立论', text: '正方胜。论证完整' }]);
    expect(speechesOfSeat(played, 9)).toEqual([]);
  });

  it('places the popover beside the card, flips it to the left at the right edge and keeps it inside the arena', () => {
    const arena = { left: 100, top: 50, width: 1000, height: 600 };
    const size = { width: 320, height: 400 };
    expect(popoverPlacement({ left: 200, top: 100, width: 118, height: 140 }, arena, size)).toEqual({ left: 230, top: 50, side: 'right' });
    expect(popoverPlacement({ left: 900, top: 100, width: 118, height: 140 }, arena, size)).toEqual({ left: 468, top: 50, side: 'left' });
    expect(popoverPlacement({ left: 200, top: 500, width: 118, height: 140 }, arena, size)).toEqual({ left: 230, top: 200, side: 'right' });
    expect(popoverPlacement({ left: 200, top: 0, width: 118, height: 140 }, arena, size).top).toBe(0);
    // 两侧都放不下：贴右侧并夹回舞台内；弹层比舞台还宽时贴左边缘
    const narrow = { left: 0, top: 0, width: 400, height: 600 };
    expect(popoverPlacement({ left: 50, top: 10, width: 118, height: 140 }, narrow, size)).toEqual({ left: 80, top: 10, side: 'right' });
    expect(popoverPlacement({ left: 50, top: 10, width: 118, height: 140 }, narrow, { width: 500, height: 400 }).left).toBe(0);
    expect(popoverPlacement({ left: 200, top: 100, width: 118, height: 140 }, arena, size, 0).left).toBe(218);
  });

  it('renders the seat profile with its speeches, state and a close control', () => {
    const speeches: readonly SeatSpeech[] = [
      { seq: 1, kind: 'speech', title: '第 1 轮 · 立论', text: '我方认为' },
      { seq: 3, kind: 'judgement', title: '第 1 轮 · 评审', text: '正方胜。论证完整' },
    ];
    const html = renderToStaticMarkup(<SeatPopover seat={seat(1, 'pro', 1)} speeches={speeches} anchor={null} arenaRef={createRef<HTMLDivElement>()} onClose={() => {}} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-labelledby="seat-popover-name"');
    expect(html).toContain('data-team="pro"');
    expect(html).toContain('aria-label="关闭座位资料"');
    expect(html).toContain('玩家1');
    expect(html).toContain('1 号 · 1号位');
    expect(html).toContain('角色pro');
    expect(html).toContain('正方');
    expect(html).toContain('存活');
    expect(html).toContain('第 1 轮 · 立论 · 发言');
    expect(html).toContain('我方认为');
    expect(html).toContain('第 1 轮 · 评审 · 评委点评');
    expect(html).toContain('seat-popover-judgement');
    expect(html.indexOf('我方认为')).toBeLessThan(html.indexOf('正方胜。论证完整'));
    expect(html).not.toContain('还没有公开发言');
    const out = renderToStaticMarkup(<SeatPopover seat={seat(3, null)} speeches={[]} anchor={null} arenaRef={createRef<HTMLDivElement>()} onClose={() => {}} />);
    expect(out).toContain('出局');
    expect(out).toContain('seat-popover-out');
    expect(out).toContain('身份未知');
    expect(out).toContain('还没有公开发言');
    expect(out).not.toContain('data-team');
  });

  it('turns the seat card into a button that reports which seat was picked', () => {
    // 座位卡片从 div 改成 button：键盘可聚焦、回车 / 空格打开座位弹层；外观类名不变
    const html = renderToStaticMarkup(<SeatCard seat={seat(1, 'pro', 1)} speaking={false} onSelect={() => {}} selected />);
    expect(html.startsWith('<button type="button"')).toBe(true);
    expect(html).toContain('seat-card seat-card-row seat-card-trigger');
    expect(html).toContain('data-seat-trigger="1"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('is-selected');
    expect(html).toContain('<span class="seat-card-body">');
    const plain = renderToStaticMarkup(<SeatCard seat={seat(1, 'pro', 1)} speaking={false} />);
    expect(plain.startsWith('<button type="button"')).toBe(true);
    expect(plain).not.toContain('aria-expanded');
    expect(plain).not.toContain('is-selected');
  });
});
