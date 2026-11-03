/// <reference types="node" />
import type { AudienceView } from '@battle/shared';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { nextFocusIndex } from '../../hooks/useDialogFocus';
import { BallotFlight } from './components/BallotFlight';
import { ResultPanel } from './components/ResultPanel';
import { ResultRoster } from './components/ResultRoster';
import { CircleLayout } from './layouts/CircleLayout';
import { fitRingBox, ringGeometry, seatAnchors } from './layouts/ringGeometry';
import { VersusLayout } from './layouts/VersusLayout';
import { seat, summary, view } from './stage.fixtures';
import { isAsleep } from './utils';

const wolfView: AudienceView = { ...view, gameKey: 'werewolf', seats: [seat(1, null), seat(2, null), seat(3, null)], extra: { sheriff: 2, board: '预女猎白' } };

describe('layouts', () => {
  it('renders debaters on their sides and the topic in the middle', () => {
    const html = renderToStaticMarkup(<VersusLayout view={view} speaking={1} center={<p>字幕</p>} />);
    expect(html).toContain('测试辩题');
    expect(html.indexOf('玩家1')).toBeLessThan(html.indexOf('字幕'));
    expect(html).toContain('seat-card-speaking');
    expect(html).toContain('评委席');
  });

  it('places every seat on the ring and marks the sheriff and the dead', () => {
    const html = renderToStaticMarkup(<CircleLayout view={wolfView} speaking={null} center={null} />);
    expect(html.match(/class="circle-seat"/g)).toHaveLength(3);
    expect(html).toContain('data-seat="2"');
    expect(html).toContain('警长');
    expect(html).toContain('预女猎白');
    expect(html).toContain('seat-card-out');
    expect(html).toContain('身份未知');
  });

  it('puts the living seats to sleep at night except the acting one, and wakes everyone by day', () => {
    const night = renderToStaticMarkup(<CircleLayout view={wolfView} speaking={2} center={null} period="night" />);
    expect(night.match(/seat-card-asleep/g)).toHaveLength(1);
    expect(night.match(/seat-card-eyes/g)).toHaveLength(1);
    expect(night).toMatch(/data-seat="1"[^]*?seat-card-asleep/);
    expect(night).toMatch(/seat-card-speaking/);
    expect(night).not.toMatch(/seat-card-speaking seat-card-asleep/);
    expect(night).not.toMatch(/seat-card-asleep seat-card-out/);
    expect(renderToStaticMarkup(<CircleLayout view={wolfView} speaking={2} center={null} period="day" />)).not.toContain('seat-card-asleep');
    expect(isAsleep(seat(3, null), null, 'night')).toBe(false);
    expect(isAsleep(seat(1, null), 1, 'night')).toBe(false);
    expect(isAsleep(seat(1, null), 2, 'night')).toBe(true);
    expect(isAsleep(seat(1, null), 2, 'day')).toBe(false);
  });

  it('mounts the ballot flight inside the ring during a tally and skips it when there is no time budget', () => {
    const vote = { seq: 7, ballots: [{ voter: 1, target: 2, weight: 1 }, { voter: 3, target: 2, weight: 1 }], abstained: [], timing: { durationMs: 400, staggerMs: 80, totalMs: 480 } };
    const html = renderToStaticMarkup(<CircleLayout view={wolfView} speaking={null} center={null} vote={vote} />);
    expect(html).toContain('class="ballot-flight"');
    expect(html).toContain('data-flight="b1-2"');
    expect(html).toContain('data-flight="b3-2"');
    expect(html.indexOf('class="ballot-flight"')).toBeGreaterThan(html.lastIndexOf('class="circle-seat"'));
    const idle = { ...vote, timing: { durationMs: 0, staggerMs: 0, totalMs: 0 } };
    expect(renderToStaticMarkup(<CircleLayout view={wolfView} speaking={null} center={null} vote={idle} />)).not.toContain('ballot-flight');
    const abstain = renderToStaticMarkup(<BallotFlight plan={{ items: [{ kind: 'abstain', key: 'a4', voter: 4, at: { x: 10, y: 20 }, delayMs: 0, durationMs: 300 }], totalMs: 300 }} />);
    expect(abstain).toContain('is-abstain');
    expect(abstain).toContain('left:10px');
    expect(renderToStaticMarkup(<BallotFlight plan={{ items: [], totalMs: 0 }} />)).toBe('');
  });

  it('shows the result with the MVP, the roster and the rematch actions', () => {
    const result = { winner: 'pro', winnerLabel: '正方胜出', summary: '正方胜出（评委 2:1）', mvp: 1, endReason: 'normal' as const };
    const html = renderToStaticMarkup(<ResultPanel result={result} view={view} />);
    expect(html).toContain('正方胜出');
    expect(html).toContain('MVP：1号 玩家1');
    expect(html).toContain('正方 · 获胜');
    expect(html).toContain('评委');
    expect(html).not.toContain('再来一局');
    expect(html).toContain('--roster-columns:3');
    const withActions = renderToStaticMarkup(<MemoryRouter><ResultPanel result={result} view={view} summary={summary} onReplay={() => {}} /></MemoryRouter>);
    expect(withActions).toContain('同样阵容再来一局');
    expect(withActions).toContain('从头回放');
    expect(withActions).toContain('href="/play/debate"');
  });

  it('renders the result dialog as a fixed, full-viewport overlay whose only grid item is the card', () => {
    // 修复依赖的结构：对话框根元素就是遮罩，卡片是它唯一的直接子元素（第二个子元素会多出一条轨道，居中就不成立）；
    // 遮罩铺满视口、层级 60、单列 minmax(0, 1fr)（隐式 auto 轨道会被卡片的长文本撑到比视口宽，再居中就把卡片推出左边缘）
    const result = { winner: 'pro', winnerLabel: '正方胜出', summary: '很长的摘要 '.repeat(60), mvp: 1, endReason: 'normal' as const };
    const html = renderToStaticMarkup(<ResultPanel result={result} view={view} onClose={() => {}} />);
    expect(html.startsWith('<section class="result-panel" role="dialog"')).toBe(true);
    expect(html.match(/class="result-card/g)).toHaveLength(1);
    expect(html).toMatch(/^<section[^>]*><div class="result-card/);
    expect(html.endsWith('</div></section>')).toBe(true);
    // vitest 把 CSS 导入替换成空串，样式契约直接读文件（测试运行在 node 环境）
    const css = readFileSync(new URL('./components/ResultPanel.css', import.meta.url), 'utf8');
    const overlay = css.slice(css.indexOf('.result-panel {'), css.indexOf('}', css.indexOf('.result-panel {')));
    expect(overlay).toContain('position: fixed;');
    expect(overlay).toContain('inset: 0;');
    expect(overlay).toContain('z-index: 60;');
    expect(overlay).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(overlay).toContain('align-content: safe center;');
  });

  it('reveals the roster row by row and sweeps the winning team, and shows a large avatar for an MVP without a poster', () => {
    const result = { winner: 'pro', winnerLabel: '正方胜出', summary: '', mvp: 1, endReason: 'normal' as const };
    const roster = renderToStaticMarkup(<ResultRoster view={view} result={result} />);
    expect(roster).toContain('--roster-rows:3');
    expect(roster).toContain('--i:0');
    expect(roster).toContain('--i:2');
    expect(roster).toMatch(/result-roster-team is-winner" data-team="pro"/);
    const noPoster = renderToStaticMarkup(<ResultPanel result={result} view={view} />);
    expect(noPoster).toContain('result-mvp-card');
    expect(noPoster).toContain('speaker-avatar-no');
    expect(noPoster).not.toContain('avatar-figure');
    const posterView: AudienceView = { ...view, seats: [{ ...seat(1, 'pro', 1), name: '豆包' }, seat(2, 'con', 1)] };
    const withPoster = renderToStaticMarkup(<ResultPanel result={result} view={posterView} />);
    expect(withPoster).toContain('avatar-figure');
    expect(withPoster).toContain('/player-poster-cutouts/doubao.webp');
    expect(withPoster).not.toContain('result-mvp-card');
  });

  it('presents the result as a modal dialog with a close control only when it can be closed', () => {
    const result = { winner: 'pro', winnerLabel: '正方胜出', summary: '', mvp: null, endReason: 'normal' as const };
    const dialog = renderToStaticMarkup(<ResultPanel result={result} view={view} onClose={() => {}} />);
    expect(dialog).toContain('role="dialog"');
    expect(dialog).toContain('aria-modal="true"');
    expect(dialog).toContain('aria-labelledby="result-winner"');
    expect(dialog).toContain('aria-label="关闭结果"');
    expect(renderToStaticMarkup(<ResultPanel result={result} view={view} />)).not.toContain('关闭结果');
  });

  it('cycles focus inside the dialog with Tab and Shift+Tab', () => {
    expect(nextFocusIndex(3, -1, false)).toBe(0);
    expect(nextFocusIndex(3, -1, true)).toBe(2);
    expect(nextFocusIndex(3, 2, false)).toBe(0);
    expect(nextFocusIndex(3, 0, true)).toBe(2);
    expect(nextFocusIndex(0, -1, false)).toBe(-1);
  });
});

describe('ring geometry', () => {
  const card = { width: 118, height: 140 };
  const adjacentOverlap = (geometry: ReturnType<typeof ringGeometry>) =>
    geometry.seats.some((seat, index) => {
      const next = geometry.seats[(index + 1) % geometry.seats.length];
      return next !== undefined && Math.abs(seat.x - next.x) < geometry.card.width && Math.abs(seat.y - next.y) < geometry.card.height;
    });

  it('fits 12 seats around the ring at a 1280×720 stage by shrinking the cards instead of overlapping', () => {
    const geometry = ringGeometry(12, { width: 734, height: 432 }, card);
    expect(geometry.seats).toHaveLength(12);
    expect(adjacentOverlap(geometry)).toBe(false);
    expect(geometry.scale).toBeLessThan(1);
    expect(geometry.scale).toBeGreaterThanOrEqual(0.6);
  });

  it('fits the ring inside an arena narrower than 1.7 × its height, keeping every card inside the box', () => {
    // 记录侧栏展开：1024 宽的舞台只剩 632 × 469，圆桌不能再按 1.7 比例撑到 797 宽
    expect(fitRingBox({ width: 632, height: 469 })).toEqual({ width: 632, height: 469 });
    expect(fitRingBox({ width: 976, height: 469 })).toEqual({ width: 797, height: 469 });
    const geometry = ringGeometry(12, fitRingBox({ width: 632, height: 469 }), card);
    for (const point of geometry.seats) {
      expect(point.x - geometry.card.width / 2).toBeGreaterThanOrEqual(0);
      expect(point.x + geometry.card.width / 2).toBeLessThanOrEqual(632);
      expect(point.y - geometry.card.height / 2).toBeGreaterThanOrEqual(0);
      expect(point.y + geometry.card.height / 2).toBeLessThanOrEqual(469);
    }
    expect(geometry.scale).toBeGreaterThanOrEqual(0.6);
  });

  it('maps seat numbers to their ring anchors in view order', () => {
    const geometry = ringGeometry(3, { width: 600, height: 400 }, card);
    const anchors = seatAnchors([5, 7, 9], geometry);
    expect(anchors.get(5)).toEqual(geometry.seats[0]);
    expect(anchors.get(9)).toEqual(geometry.seats[2]);
    expect(anchors.get(1)).toBeUndefined();
  });

  it('keeps full-size cards when there is room and places seat 1 at the top, going clockwise', () => {
    const geometry = ringGeometry(12, { width: 1200, height: 774 }, card);
    expect(geometry.scale).toBe(1);
    expect(adjacentOverlap(geometry)).toBe(false);
    const [first, second] = geometry.seats;
    expect(first?.x).toBeCloseTo(600, 5);
    expect(first?.y).toBeCloseTo(card.height / 2, 5);
    expect(second?.x ?? 0).toBeGreaterThan(first?.x ?? 0);
    expect(ringGeometry(1, { width: 400, height: 300 }, card).seats).toHaveLength(1);
  });
});
