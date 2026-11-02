import type { AudienceView, MatchSummaryDto, StageEvent } from '@battle/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchStreamUrl } from '../../services/matches';
import { resolvePoster } from '../../utils/posters';
import { ResultPanel } from './components/ResultPanel';
import { SubtitleBar } from './components/SubtitleBar';
import { VoteBoard } from './components/VoteBoard';
import { CircleLayout } from './layouts/CircleLayout';
import { VersusLayout } from './layouts/VersusLayout';
import { describeEvent, displayDuration, shouldSpeak } from './playback/describe';
import { playAudio, speak } from './playback/media';
import type { StreamItem } from './types';
import { judgeBadges, nightStepsOf, periodOf, rosterByTeam, speechOrderOf } from './utils';

const seat = (no: number, team: string | null, position: number | null = null) => ({
  seat: no, name: `玩家${no}`, avatar: null, label: `${no}号 玩家${no}`, alive: no !== 3,
  role: team, roleName: team ? `角色${team}` : null, team, position,
});

const view: AudienceView = {
  gameKey: 'debate', title: 'AI 辩论赛', round: 1, phase: { id: 'opening', title: '立论' }, status: 'running',
  seats: [seat(1, 'pro', 1), seat(2, 'con', 1), seat(3, 'judge')],
  extra: { topic: { title: '测试辩题', pro: '支持', con: '反对' } },
  result: null,
};

const meta = { seq: 1, round: 1, phaseId: 'opening', channel: 'public' as const, view };

describe('describeEvent', () => {
  it('maps speeches, votes and eliminations to subtitles', () => {
    expect(describeEvent({ ...meta, kind: 'speech', seat: 1, text: '大家好' })).toEqual({ speaker: 1, text: '大家好' });
    const tally: StageEvent = {
      ...meta, kind: 'vote_tallied', title: '放逐投票', runoff: 0, ballots: [], abstained: [],
      tally: [{ target: 2, votes: 3 }], tied: [], outcome: { kind: 'selected', seat: 2, byTieBreak: false },
    };
    expect(describeEvent(tally).text).toBe('放逐投票：2号 3 票，2号当选');
    expect(describeEvent({ ...meta, kind: 'seat_eliminated', seat: 2, reason: '被放逐' }).text).toBe('2号出局（被放逐）');
    expect(describeEvent({ ...meta, kind: 'fallback', seat: 1, reason: 'x' }).text).toBeNull();
  });

  it('speaks only spoken content and scales display time with speed', () => {
    expect(shouldSpeak({ ...meta, kind: 'phase_started', title: '立论' })).toBe(false);
    expect(shouldSpeak({ ...meta, kind: 'narration', text: '开始' })).toBe(true);
    expect(displayDuration('一'.repeat(20), 2)).toBe(displayDuration('一'.repeat(20), 1) / 2);
    expect(displayDuration(null, 1)).toBeLessThan(1000);
  });
});

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
    expect(html.match(/circle-seat/g)).toHaveLength(3);
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
    const summary: MatchSummaryDto = {
      id: 'm_1', gameKey: 'debate', gameTitle: 'AI 辩论赛', variantKey: null, variantName: null, status: 'completed', debug: false, scripted: true,
      seats: [{ seat: 1, playerId: 5, name: '玩家1' }, { seat: 2, playerId: null, name: '玩家2' }], result, createdAt: '2026-11-01T00:00:00Z', completedAt: null,
    };
    const withActions = renderToStaticMarkup(<MemoryRouter><ResultPanel result={result} view={view} summary={summary} onReplay={() => {}} /></MemoryRouter>);
    expect(withActions).toContain('同样阵容再来一局');
    expect(withActions).toContain('从头回放');
    expect(withActions).toContain('href="/play/debate"');
  });
});

describe('media playback failures', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('dwells for the fallback time when the browser refuses to play, instead of finishing instantly', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Audio', class {
      playbackRate = 1;
      addEventListener() {}
      pause() {}
      play() { return Promise.reject(new Error('NotAllowedError')); }
    });
    let finished = false;
    void playAudio('/api/media/x', 1, new AbortController().signal, 1500).then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(1000);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(600);
    expect(finished).toBe(true);
  });

  it('dwells by text length when speech synthesis is unavailable', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {});
    let finished = false;
    void speak('一'.repeat(20), 1, new AbortController().signal).then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(displayDuration('一'.repeat(20), 1) - 100);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(finished).toBe(true);
  });
});

describe('stage derivations', () => {
  const item = (event: StageEvent): StreamItem => ({ event, audio: null });
  const nightView: AudienceView = { ...view, gameKey: 'werewolf', phase: { id: 'wolf_kill', title: '狼人击杀' }, extra: { period: 'night' } };

  it('lists the night phases of the current round, in order and without repeats', () => {
    const played = [
      item({ ...meta, kind: 'phase_started', title: '天黑请闭眼', view: nightView }),
      item({ ...meta, seq: 2, kind: 'phase_started', title: '守卫守护', view: nightView }),
      item({ ...meta, seq: 3, kind: 'phase_started', title: '守卫守护', view: nightView }),
    ];
    const current = item({ ...meta, seq: 4, kind: 'phase_started', title: '狼人击杀', view: nightView });
    expect(nightStepsOf(played, current, nightView)).toEqual(['天黑请闭眼', '守卫守护', '狼人击杀']);
    expect(nightStepsOf(played, current, { ...nightView, extra: { period: 'day' } })).toEqual([]);
  });

  it('tracks who has spoken in the current phase and what the judges decided', () => {
    const speeches = [item({ ...meta, kind: 'speech', seat: 1, text: 'a' }), item({ ...meta, seq: 2, kind: 'speech', seat: 2, text: 'b' })];
    expect(speechOrderOf(speeches, item({ ...meta, seq: 3, kind: 'speech', seat: 1, text: 'c' }), view)).toEqual([1, 2]);
    expect(speechOrderOf(speeches, null, { ...view, phase: { id: 'other', title: 'x' } })).toEqual([]);
    expect(judgeBadges([item({ ...meta, kind: 'judgement', seat: 3, verdict: 'pro', verdictLabel: '正方胜', comment: '' })])).toEqual({ 3: ['正方胜'] });
    expect(rosterByTeam(view).map((group) => [group.label, group.seats.length])).toEqual([['正方', 1], ['反方', 1], ['评委', 1]]);
  });
});

describe('stage visuals', () => {
  it('maps player names to the built-in posters and falls back to the avatar', () => {
    expect(resolvePoster('豆包', null)).toBe('/player-poster-cutouts/doubao.webp');
    expect(resolvePoster('Claude', null, 'poster')).toBe('/player-posters/claude-code.webp');
    expect(resolvePoster('通义 千问', null)).toBe('/player-poster-cutouts/qwen.webp');
    expect(resolvePoster('阿明', 'https://x/a.png')).toBe('https://x/a.png');
    expect(resolvePoster('阿明', null)).toBeNull();
  });

  it('derives day or night from the view, preferring what the game reports', () => {
    expect(periodOf(null)).toBe('night');
    expect(periodOf({ ...view, gameKey: 'werewolf', extra: { period: 'day' }, phase: { id: 'x', title: '天黑请闭眼' } })).toBe('day');
    expect(periodOf({ ...view, gameKey: 'werewolf', extra: {}, phase: { id: 'x', title: '天黑请闭眼' } })).toBe('night');
    expect(periodOf({ ...view, gameKey: 'werewolf', extra: {}, phase: { id: 'x', title: '白天发言' } })).toBe('day');
    expect(periodOf(view)).toBe('day');
  });

  it('renders the subtitle bar with the speaker and the vote board with bars', () => {
    const speech: StageEvent = { ...meta, kind: 'speech', seat: 1, text: '我的观点是' };
    const subtitle = renderToStaticMarkup(<SubtitleBar item={{ event: speech, audio: null }} view={view} />);
    expect(subtitle).toContain('玩家1');
    expect(subtitle).toContain('我的观点是');
    expect(subtitle).toContain('发言');
    expect(renderToStaticMarkup(<SubtitleBar item={null} view={view} />)).toContain('is-idle');
    const tally: StageEvent = {
      ...meta, kind: 'vote_tallied', title: '评委投票', runoff: 0, ballots: [], abstained: [],
      tally: [{ target: 1, votes: 2 }, { target: 2, votes: 1 }], tied: [], outcome: { kind: 'selected', seat: 1, byTieBreak: false },
    };
    const board = renderToStaticMarkup(<VoteBoard event={tally} view={view} />);
    expect(board).toContain('评委投票');
    expect(board).toContain('width:100%');
    expect(board).toContain('width:50%');
    expect(board).toContain('玩家1 当选');
  });
});

describe('matchStreamUrl', () => {
  it('uses wss behind https', () => {
    expect(matchStreamUrl('m_1', { protocol: 'https:', host: 'a.com' })).toBe('wss://a.com/api/toc/ws/matches/m_1');
    expect(matchStreamUrl('m 1', { protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:5173/api/toc/ws/matches/m%201');
  });
});
