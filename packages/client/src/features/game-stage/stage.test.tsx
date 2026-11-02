import type { AudienceView, MatchSummaryDto, StageEvent } from '@battle/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextFocusIndex } from '../../hooks/useDialogFocus';
import { matchStreamUrl } from '../../services/matches';
import { resolvePoster } from '../../utils/posters';
import { NightSteps } from './components/NightSteps';
import { PhaseBanner } from './components/PhaseBanner';
import { PlaybackControls } from './components/PlaybackControls';
import { ResultPanel } from './components/ResultPanel';
import { SubtitleBar } from './components/SubtitleBar';
import { VoteBoard } from './components/VoteBoard';
import { CircleLayout } from './layouts/CircleLayout';
import { ringGeometry } from './layouts/ringGeometry';
import { VersusLayout } from './layouts/VersusLayout';
import { describeEvent, displayDuration, shouldSpeak } from './playback/describe';
import { dwell, playAudio, speak } from './playback/media';
import { SegmentControl, progressFraction } from './playback/segment';
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

  it('does not cap the display time, so a long speech is shown in full when muted', () => {
    expect(displayDuration('一'.repeat(300), 1)).toBe(48000);
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
    const summary: MatchSummaryDto = {
      id: 'm_1', gameKey: 'debate', gameTitle: 'AI 辩论赛', variantKey: null, variantName: null, layout: 'versus', status: 'completed', debug: false, scripted: true,
      seats: [{ seat: 1, playerId: 5, name: '玩家1' }, { seat: 2, playerId: null, name: '玩家2' }], result, createdAt: '2026-11-01T00:00:00Z', completedAt: null,
    };
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

class FakeAudio {
  static instances: FakeAudio[] = [];
  playbackRate = 1;
  currentTime = 0;
  duration = Number.NaN;
  paused = false;
  readonly listeners = new Map<string, (() => void)[]>();
  constructor(readonly url: string) {
    FakeAudio.instances.push(this);
  }
  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
  pause() {
    this.paused = true;
  }
  play() {
    return Promise.resolve();
  }
}

describe('media playback', () => {
  const text = '一'.repeat(20);
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    FakeAudio.instances = [];
  });

  it('dwells for the text time when the browser refuses to play, instead of finishing instantly', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Audio', class extends FakeAudio {
      override play() {
        return Promise.reject(new Error('NotAllowedError'));
      }
    });
    let finished = false;
    void playAudio('/api/media/x', new SegmentControl(1, false), text).then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(displayDuration(text, 1) - 100);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(finished).toBe(true);
  });

  it('dwells by text length when speech synthesis is unavailable', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {});
    let finished = false;
    void speak(text, new SegmentControl(1, false)).then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(displayDuration(text, 1) - 100);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(finished).toBe(true);
  });

  it('applies a speed change to the playing audio and reports progress from timeupdate', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Audio', FakeAudio);
    const control = new SegmentControl(1, false);
    let finished = false;
    void playAudio('/api/media/x', control, text).then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(0);
    const audio = FakeAudio.instances[0];
    expect(audio?.playbackRate).toBe(1);
    control.setRate(2);
    expect(audio?.playbackRate).toBe(2);
    if (audio) {
      audio.duration = 12;
      audio.currentTime = 3;
      audio.emit('timeupdate');
    }
    expect(control.progress).toEqual({ kind: 'measured', fraction: 0.25 });
    expect(finished).toBe(false);
    audio?.emit('ended');
    await vi.advanceTimersByTimeAsync(0);
    expect(finished).toBe(true);
  });

  it('stops the audio when muted and dwells for the remaining text time', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Audio', FakeAudio);
    const control = new SegmentControl(1, false);
    let finished = false;
    void playAudio('/api/media/x', control, text).then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(0);
    const audio = FakeAudio.instances[0];
    if (audio) {
      audio.duration = 10;
      audio.currentTime = 5;
    }
    control.mute();
    expect(audio?.paused).toBe(true);
    expect(control.progress).toMatchObject({ kind: 'timed', fraction: 0.5, remainingMs: displayDuration(text, 1) / 2 });
    await vi.advanceTimersByTimeAsync(displayDuration(text, 1) / 2 - 100);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(finished).toBe(true);
  });

  it('rescales the remaining dwell when the speed changes mid-way', async () => {
    vi.useFakeTimers();
    const control = new SegmentControl(1, false);
    let finished = false;
    void dwell(control, text).then(() => { finished = true; });
    const total = displayDuration(text, 1);
    await vi.advanceTimersByTimeAsync(total / 2);
    control.setRate(2);
    expect(control.progress).toMatchObject({ kind: 'timed', fraction: 0.5, remainingMs: total / 4 });
    expect(progressFraction(control.progress, Date.now() + total / 8)).toBeCloseTo(0.75, 5);
    await vi.advanceTimersByTimeAsync(total / 4 - 100);
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

  it('drives the subtitle progress bar from the segment: audio progress as width, dwell as a timed animation', () => {
    const speech: StageEvent = { ...meta, kind: 'speech', seat: 1, text: '我的观点是' };
    const item = { event: speech, audio: null };
    const measured = new SegmentControl(1, false);
    measured.setProgress({ kind: 'measured', fraction: 0.25 });
    expect(renderToStaticMarkup(<SubtitleBar item={item} view={view} control={measured} />)).toContain('width:25%');
    const timed = new SegmentControl(1, false);
    timed.setProgress({ kind: 'timed', fraction: 0.25, startedAt: 0, remainingMs: 3000 });
    const html = renderToStaticMarkup(<SubtitleBar item={item} view={view} control={timed} />);
    expect(html).toContain('animation-duration:4000ms');
    expect(html).toContain('animation-delay:-1000ms');
    expect(renderToStaticMarkup(<SubtitleBar item={item} view={view} />)).not.toContain('subtitle-progress');
  });

  it('keeps the subtitle bar as the only live region on the stage', () => {
    const phase: StageEvent = { ...meta, kind: 'phase_started', title: '立论' };
    const tally: StageEvent = {
      ...meta, kind: 'vote_tallied', title: '评委投票', runoff: 0, ballots: [], abstained: [], tally: [], tied: [], outcome: { kind: 'none' },
    };
    const html = renderToStaticMarkup(
      <>
        <SubtitleBar item={{ event: phase, audio: null }} view={view} />
        <PhaseBanner item={{ event: phase, audio: null }} />
        <VoteBoard event={tally} view={view} />
        <NightSteps steps={['天黑请闭眼', '狼人击杀']} />
        <PlaybackControls options={{ speed: 1, paused: false, muted: false }} pending={2} finished={false} feedOpen={false} onChange={() => {}} onToggleFeed={() => {}} />
      </>,
    );
    expect(html.match(/aria-live=/g)).toHaveLength(1);
    expect(html).not.toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });
});

describe('matchStreamUrl', () => {
  it('uses wss behind https', () => {
    expect(matchStreamUrl('m_1', { protocol: 'https:', host: 'a.com' })).toBe('wss://a.com/api/toc/ws/matches/m_1');
    expect(matchStreamUrl('m 1', { protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:5173/api/toc/ws/matches/m%201');
  });
});
