import type { AudienceView, StageEvent } from '@battle/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { matchStreamUrl } from '../../services/matches';
import { resolvePoster } from '../../utils/posters';
import { NightSteps } from './components/NightSteps';
import { PhaseBanner } from './components/PhaseBanner';
import { PlaybackControls } from './components/PlaybackControls';
import { StageError } from './components/StageError';
import { StageHud } from './components/StageHud';
import { SubtitleBar } from './components/SubtitleBar';
import { VoteBoard } from './components/VoteBoard';
import { SegmentControl } from './playback/segment';
import { meta, summary, view } from './stage.fixtures';
import type { StreamItem } from './types';
import { judgeBadges, nightStepsOf, periodOf, rosterByTeam, speechOrderOf } from './utils';

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

  it('shows the acting seat as the subtitle speaker for an action, even though the host voice reads it', () => {
    const action: StageEvent = { ...meta, kind: 'action', seat: 2, action: 'shoot', targets: [1], text: '2号开枪带走了1号' };
    const html = renderToStaticMarkup(<SubtitleBar item={{ event: action, audio: null }} view={view} />);
    expect(html).toContain('玩家2');
    expect(html).toContain('行动 · 2 号');
    expect(html).not.toContain('主持人');
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

  it('shows the connection state on the HUD and offers a retry only when the connection was lost', () => {
    const hud = (connection: 'connecting' | 'open' | 'lost' | 'closed', ended = false) =>
      renderToStaticMarkup(<StageHud summary={summary} view={null} connection={connection} ended={ended} />);
    expect(hud('open')).toContain('LIVE');
    expect(hud('connecting')).toContain('连接中');
    expect(hud('lost')).toContain('连接中断');
    expect(hud('lost')).toContain('is-lost');
    expect(hud('closed', true)).toContain('已结束');
    expect(renderToStaticMarkup(<StageError message="连接中断，请刷新重试" onRetry={() => {}} />)).toContain('重试');
    expect(renderToStaticMarkup(<StageError message="对局不存在" onRetry={null} />)).not.toContain('重试');
  });
});

describe('matchStreamUrl', () => {
  it('uses wss behind https', () => {
    expect(matchStreamUrl('m_1', { protocol: 'https:', host: 'a.com' })).toBe('wss://a.com/api/toc/ws/matches/m_1');
    expect(matchStreamUrl('m 1', { protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:5173/api/toc/ws/matches/m%201');
  });
});
