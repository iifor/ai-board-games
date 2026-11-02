import type { AudienceView } from '@battle/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { nextFocusIndex } from '../../hooks/useDialogFocus';
import { ResultPanel } from './components/ResultPanel';
import { CircleLayout } from './layouts/CircleLayout';
import { ringGeometry } from './layouts/ringGeometry';
import { VersusLayout } from './layouts/VersusLayout';
import { seat, summary, view } from './stage.fixtures';

describe('layouts', () => {
  it('renders debaters on their sides and the topic in the middle', () => {
    const html = renderToStaticMarkup(<VersusLayout view={view} speaking={1} center={<p>字幕</p>} />);
    expect(html).toContain('测试辩题');
    expect(html.indexOf('玩家1')).toBeLessThan(html.indexOf('字幕'));
    expect(html).toContain('seat-card-speaking');
    expect(html).toContain('评委席');
  });

  it('places every seat on the ring and marks the sheriff and the dead', () => {
    const wolfView: AudienceView = { ...view, gameKey: 'werewolf', seats: [seat(1, null), seat(2, null), seat(3, null)], extra: { sheriff: 2, board: '预女猎白' } };
    const html = renderToStaticMarkup(<CircleLayout view={wolfView} speaking={null} center={null} />);
    expect(html.match(/class="circle-seat"/g)).toHaveLength(3);
    expect(html).toContain('警长');
    expect(html).toContain('预女猎白');
    expect(html).toContain('seat-card-out');
    expect(html).toContain('身份未知');
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
