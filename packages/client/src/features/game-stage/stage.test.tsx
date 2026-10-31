import type { AudienceView, StageEvent } from '@battle/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { matchStreamUrl } from '../../services/matches';
import { ResultPanel } from './components/ResultPanel';
import { CircleLayout } from './layouts/CircleLayout';
import { VersusLayout } from './layouts/VersusLayout';
import { describeEvent, displayDuration, shouldSpeak } from './playback/describe';

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

  it('shows the result with the MVP', () => {
    const html = renderToStaticMarkup(<ResultPanel result={{ winner: 'pro', winnerLabel: '正方胜出', summary: '正方胜出（评委 2:1）', mvp: 1, endReason: 'normal' }} view={view} />);
    expect(html).toContain('正方胜出');
    expect(html).toContain('MVP：1号 玩家1');
  });
});

describe('matchStreamUrl', () => {
  it('uses wss behind https', () => {
    expect(matchStreamUrl('m_1', { protocol: 'https:', host: 'a.com' })).toBe('wss://a.com/api/toc/ws/matches/m_1');
    expect(matchStreamUrl('m 1', { protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:5173/api/toc/ws/matches/m%201');
  });
});
