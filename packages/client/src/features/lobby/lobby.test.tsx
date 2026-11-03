import { formatMatchTitle, type GameCatalogItem, type MatchSummaryDto } from '@battle/shared';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { formatDateTime, formatWinner } from '../../utils/format';
import { arcPoints, fadeOut, flightDuration, flightKeyframes, flyTo, parallaxOffset, prefersReducedMotion } from './animations';
import { BoardPicker } from './components/BoardPicker';
import { GameList } from './components/GameList';
import { LobbyHero } from './components/LobbyHero';
import { PlayerPicker } from './components/PlayerPicker';
import { RecentMatches } from './components/RecentMatches';
import { SeatGrid } from './components/SeatGrid';
import { SetupActionBar } from './components/SetupActionBar';
import { filterVariants, isSetupInitial, playerRange, readyLabel, rematchStateOf, selectionHint, toggleSelection } from './utils';

const werewolf: GameCatalogItem = {
  key: 'werewolf', title: 'AI 狼人杀', description: '12 人', players: { min: 12, max: 12 }, layout: 'circle',
  variants: [{
    key: 'standard-12', name: '预女猎白', description: '', players: { min: 12, max: 12 },
    roles: [{ name: '狼人', team: 'werewolf', count: 4 }, { name: '预言家', team: 'good', count: 1 }, { name: '村民', team: 'good', count: 7 }],
  }],
  defaultVariant: 'standard-12',
};

describe('lobby utils', () => {
  it('keeps selection order as seat order', () => {
    expect(toggleSelection([3, 1], 2)).toEqual([3, 1, 2]);
    expect(toggleSelection([3, 1, 2], 1)).toEqual([3, 2]);
  });

  it('explains what is missing', () => {
    expect(selectionHint(9, { min: 9, max: 12 })).toBeNull();
    expect(selectionHint(7, { min: 9, max: 12 })).toBe('还需选择 2 名玩家');
    expect(selectionHint(13, { min: 9, max: 12 })).toBe('最多 12 名玩家，请取消 1 名');
    expect(playerRange(werewolf, 'standard-12')).toEqual({ min: 12, max: 12 });
  });

  it('only says the table is full at the maximum, otherwise how many more can join', () => {
    expect(readyLabel(9, { min: 9, max: 12 })).toBe('可开局，还可再加 3 人');
    expect(readyLabel(11, { min: 9, max: 12 })).toBe('可开局，还可再加 1 人');
    expect(readyLabel(12, { min: 9, max: 12 })).toBe('人数已满，可以开始');
    expect(readyLabel(12, { min: 12, max: 12 })).toBe('人数已满，可以开始');
  });

  it('searches boards by name or role and recognises rematch state', () => {
    expect(filterVariants(werewolf.variants, '预言').map((variant) => variant.key)).toEqual(['standard-12']);
    expect(filterVariants(werewolf.variants, '猎魔人')).toEqual([]);
    expect(filterVariants(werewolf.variants, '  ')).toHaveLength(1);
    expect(isSetupInitial({ variant: 'standard-12', playerIds: [1, 2] })).toBe(true);
    expect(isSetupInitial({ playerIds: ['a'] })).toBe(false);
    expect(isSetupInitial('standard-12')).toBe(false);
    expect(isSetupInitial({})).toBe(false);
  });

  it('builds the rematch state the setup page accepts, skipping seats without a player', () => {
    const summary: MatchSummaryDto = {
      id: 'm_1', gameKey: 'werewolf', gameTitle: 'AI 狼人杀', variantKey: 'standard-12', variantName: '预女猎白', layout: 'circle', status: 'completed',
      debug: false, scripted: false, chaos: false, seats: [{ seat: 1, playerId: 5, name: 'a' }, { seat: 2, playerId: null, name: 'b' }, { seat: 3, playerId: 7, name: 'c' }],
      result: null, createdAt: '2026-11-01T12:00:00Z', completedAt: null,
    };
    const state = rematchStateOf(summary);
    expect(state).toEqual({ variant: 'standard-12', playerIds: [5, 7] });
    expect(isSetupInitial(state)).toBe(true);
    expect(formatMatchTitle(summary)).toBe('AI 狼人杀 · 预女猎白');
    expect(formatMatchTitle({ ...summary, variantName: null })).toBe('AI 狼人杀');
    expect(formatWinner(summary)).toBe('未分胜负');
    expect(formatWinner({ result: { winner: 'good', winnerLabel: '好人胜利', summary: '', mvp: null, endReason: 'normal' } })).toBe('好人胜利');
    expect(formatDateTime(summary.createdAt)).toMatch(/^2026\/11\/1 \d{2}:\d{2}:\d{2}$/);
  });
});

describe('lobby components', () => {
  it('lists games with player counts and boards', () => {
    const html = renderToStaticMarkup(<MemoryRouter><GameList games={[werewolf]} /></MemoryRouter>);
    expect(html).toContain('12 人 · 1 个板子');
    expect(html).toContain('href="/play/werewolf"');
  });

  it('puts the seating status on the action bar from the catalog range', () => {
    const bar = (count: number, range: { min: number; max: number }) =>
      renderToStaticMarkup(<SetupActionBar boardName="预女猎白" count={count} range={range} hint={selectionHint(count, range)} topicPartial={false} submitting={false} />);
    expect(bar(9, { min: 9, max: 12 })).toContain('可开局，还可再加 3 人');
    expect(bar(12, { min: 9, max: 12 })).toContain('人数已满，可以开始');
    expect(bar(7, { min: 9, max: 12 })).toContain('还需选择 2 名玩家');
    expect(bar(7, { min: 9, max: 12 })).toContain('disabled=""');
  });

  it('tells a failed history apart from an empty one and keeps the lobby around it', () => {
    const summary: MatchSummaryDto = {
      id: 'm_1', gameKey: 'werewolf', gameTitle: 'AI 狼人杀', variantKey: 'standard-12', variantName: '预女猎白', layout: 'circle', status: 'completed',
      debug: false, scripted: false, chaos: false, seats: [], result: null, createdAt: '2026-11-01T12:00:00Z', completedAt: null,
    };
    const render = (node: ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
    const failed = render(<RecentMatches history={{ status: 'error', message: '网络连接失败' }} onRetry={() => {}} />);
    expect(failed).toContain('最近对局加载失败：网络连接失败');
    expect(failed).toContain('重试');
    expect(failed).toContain('href="/history"');
    expect(failed).not.toContain('还没有完成的对局');
    expect(render(<RecentMatches history={{ status: 'ready', data: [] }} onRetry={() => {}} />)).toBe('');
    expect(render(<RecentMatches history={{ status: 'loading' }} onRetry={() => {}} />)).toContain('加载中');
    expect(render(<RecentMatches history={{ status: 'ready', data: [summary] }} onRetry={() => {}} />)).toContain('AI 狼人杀 · 预女猎白');
    const hero = render(<LobbyHero primaryGame={werewolf} history={{ status: 'error', message: 'x' }} />);
    expect(hero).toContain('最近对局暂时拉不到');
    expect(hero).not.toContain('还没有完成的对局');
    expect(render(<LobbyHero primaryGame={werewolf} history={{ status: 'ready', data: [] }} />)).toContain('还没有完成的对局');
    const withLatest = render(<LobbyHero primaryGame={werewolf} history={{ status: 'ready', data: [summary] }} />);
    expect(withLatest).toContain('最近一局 · AI 狼人杀 · 预女猎白');
    expect(withLatest).toContain('未分胜负');
    expect(withLatest).toContain(`dateTime="${summary.createdAt}"`);
    expect(withLatest).toContain('回放 →');
    expect(withLatest).toContain('href="/matches/m_1"');
    expect(render(<LobbyHero primaryGame={werewolf} history={{ status: 'ready', data: [] }} />)).toContain('去开一局 →');
  });

  it('staggers the hero and the game cards on first paint', () => {
    const hero = renderToStaticMarkup(<MemoryRouter><LobbyHero primaryGame={werewolf} history={{ status: 'loading' }} /></MemoryRouter>);
    expect(hero.match(/class="[^"]*ui-fade-up/g)?.length).toBeGreaterThanOrEqual(5);
    expect(hero).not.toContain('class="lobby-hero ui-fade-up"');
    const cards = renderToStaticMarkup(<MemoryRouter><GameList games={[werewolf, { ...werewolf, key: 'debate', title: 'AI 辩论赛' }]} /></MemoryRouter>);
    expect(cards).toContain('style="--i:5"');
    expect(cards).toContain('style="--i:6"');
  });

  it('seats players in pick order on the seat grid and keeps empty seats numbered', () => {
    const players = [{ id: 5, name: '阿明', avatar: null, persona: '' }, { id: 6, name: '小红', avatar: null, persona: '' }];
    const html = renderToStaticMarkup(<SeatGrid seated={[players[1]!, players[0]!]} max={3} onUnseat={() => {}} arrivalDelay={(id) => (id === 5 ? 420 : 0)} />);
    expect(html).toContain('aria-label="1 号 小红，点击取消就座"');
    expect(html).toContain('aria-label="2 号 阿明，点击取消就座"');
    expect(html).toContain('--seat-delay:420ms');
    expect(html).toContain('--seat-delay:0ms');
    expect(html).toContain('>3<');
    expect(html).not.toContain('is-over');
    const over = renderToStaticMarkup(<SeatGrid seated={[players[0]!, players[1]!]} max={1} onUnseat={() => {}} />);
    expect(over).toContain('is-over');
  });

  it('pulses the start button only while seating is complete and gives role pills their stagger index', () => {
    const bar = (count: number) =>
      renderToStaticMarkup(<SetupActionBar boardName="预女猎白" count={count} range={{ min: 9, max: 12 }} hint={selectionHint(count, { min: 9, max: 12 })} topicPartial={false} submitting={false} />);
    expect(bar(9)).toContain('is-pulsing');
    expect(bar(9)).toContain('setup-action-progress is-ready');
    expect(bar(7)).not.toContain('is-pulsing');
    const picker = renderToStaticMarkup(<BoardPicker variants={werewolf.variants} value="standard-12" onChange={() => {}} />);
    expect(picker).toContain('style="--i:2"');
    expect(picker).toContain('board-card is-selected');
  });

  it('numbers selected players by seat', () => {
    const html = renderToStaticMarkup(
      <PlayerPicker players={[{ id: 5, name: '阿明', avatar: null, persona: '' }, { id: 6, name: '小红', avatar: null, persona: '冷静' }]} selected={[6, 5]} onToggle={() => {}} />,
    );
    expect(html.indexOf('>2<')).toBeLessThan(html.indexOf('阿明'));
    expect(html).toContain('冷静');
  });
});

describe('lobby animations', () => {
  it('samples an arc that starts and ends on the endpoints and lifts in the middle', () => {
    const points = arcPoints(200, 100, 40, 4);
    expect(points).toHaveLength(5);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[4]).toEqual({ x: 200, y: 100 });
    expect(points[2]!.x).toBeCloseTo(100);
    expect(points[2]!.y).toBeCloseTo(50 - 20);
    expect(arcPoints(200, 100, 0, 2)[1]).toEqual({ x: 100, y: 50 });
  });

  it('builds flight keyframes that translate and scale the clone onto the target', () => {
    const frames = flightKeyframes({ left: 10, top: 20, width: 84, height: 84 }, { left: 310, top: 420, width: 42, height: 42 }, 0);
    expect(frames[0]).toEqual({ offset: 0, transform: 'translate(0.00px, 0.00px) scale(1.0000)' });
    expect(frames.at(-1)).toEqual({ offset: 1, transform: 'translate(300.00px, 400.00px) scale(0.5000)' });
    expect(frames.every((frame, index) => frame.offset === index / (frames.length - 1))).toBe(true);
  });

  it('scales the flight duration with distance inside fixed bounds', () => {
    expect(flightDuration(0)).toBe(280);
    expect(flightDuration(400)).toBe(380);
    expect(flightDuration(5000)).toBe(560);
  });

  it('moves the parallax layer against the pointer and clamps at the edges', () => {
    const rect = { left: 100, top: 100, width: 200, height: 100 };
    expect(parallaxOffset({ x: 200, y: 150 }, rect, 10)).toEqual({ x: 0, y: 0 });
    expect(parallaxOffset({ x: 300, y: 100 }, rect, 10)).toEqual({ x: -10, y: 10 });
    expect(parallaxOffset({ x: 9999, y: -9999 }, rect, 8)).toEqual({ x: -8, y: 8 });
    expect(parallaxOffset({ x: 1, y: 1 }, { ...rect, width: 0 }, 8)).toEqual({ x: 0, y: 0 });
  });

  it('does nothing without a DOM or the Web Animations API', () => {
    expect(prefersReducedMotion()).toBe(false);
    const fake = {} as HTMLElement;
    expect(flyTo(fake, fake)).toBe(0);
    expect(fadeOut(fake)).toBe(0);
  });
});
