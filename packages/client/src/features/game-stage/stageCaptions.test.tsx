import type { MatchSummaryDto, StageEvent } from '@battle/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { StagePage } from './pages/StagePage';
import { SegmentControl } from './playback/segment';
import { meta, summary, view } from './stage.fixtures';
import type { StreamItem } from './types';

const fixture = vi.hoisted(() => ({
  summary: null as MatchSummaryDto | null,
  current: null as StreamItem | null,
  control: null as SegmentControl | null,
}));
vi.mock('../../hooks/useAsync', () => ({ useAsync: () => ({ status: 'ready', data: fixture.summary }) }));
vi.mock('./hooks/useMatchStream', () => ({
  useMatchStream: () => ({ items: [], ack: () => {}, ended: false, result: null, error: null, connection: 'open' }),
}));
vi.mock('./hooks/usePlayback', () => ({
  usePlayback: () => ({ current: fixture.current, played: [], pending: 1, view: fixture.current?.event.view, control: fixture.control }),
}));
vi.mock('./hooks/useAudienceSetting', () => ({
  useAudienceSetting: () => ({ seat: null, afterSeq: 0, switchMode: () => {} }),
}));

function renderPage(event: StageEvent, layout: 'circle' | 'versus', captions?: StreamItem['audio']) {
  fixture.summary = { ...summary, gameKey: event.view.gameKey, layout };
  fixture.current = { event, audio: captions ?? null };
  fixture.control = new SegmentControl(1, false);
  fixture.control.setProgress({ kind: 'measured', fraction: 0.25, positionMs: 500 });
  return renderToStaticMarkup(<MemoryRouter><StagePage /></MemoryRouter>);
}

describe('bottom captions in the normal stage page', () => {
  it.each(['circle', 'versus'] as const)('shows history panels and their buttons only for the circle stage (%s)', layout => {
    const event: StageEvent = { ...meta, view: { ...view, gameKey: layout === 'circle' ? 'werewolf' : 'debate' }, kind: 'speech', seat: 1, text: '当前发言。' };
    const html = renderPage(event, layout);
    expect(html.includes('stage-history-overview')).toBe(layout === 'circle');
    expect(html.includes('stage-history-speech')).toBe(layout === 'circle');
    expect(html.includes('>对局记录</button>')).toBe(layout === 'circle');
    expect(html.includes('>发言记录</button>')).toBe(layout === 'circle');
    expect(html).toContain('← 返回大厅');
    expect(html).toContain('class="speech-carousel"');
    expect(html).toContain('aria-label="逐句字幕"');
  });

  it.each(['circle', 'versus'] as const)('keeps bottom captions beside the central player speech in %s layout', layout => {
    const currentView = { ...view, gameKey: layout === 'circle' ? 'werewolf' : 'debate' };
    const event: StageEvent = { ...meta, view: currentView, kind: 'speech', seat: 1, text: '【冷静】先听理由。【停顿】再决定。' };
    const html = renderPage(event, layout, {
      url: '/api/media/test', mime: 'audio/mpeg', captions: [
        { text: '【冷静】先听理由。', startMs: 50, endMs: 1000 },
        { text: '再决定。', startMs: 1500, endMs: 2500 },
      ],
    });
    expect(html).toContain('class="speech-carousel"');
    expect(html).toContain('aria-label="逐句字幕"');
    expect(html).toMatch(/class="sentence-caption-line"[\s\S]*?<p[^>]*>先听理由。<\/p>/);
    expect(html.match(/aria-live="polite"/g)).toHaveLength(1);
  });

  it('shows bottom captions for the judge comment as well as the verdict in the center', () => {
    const event: StageEvent = { ...meta, kind: 'judgement', seat: 3, verdict: 'pro', verdictLabel: '正方胜', comment: '【停顿】论证完整。' };
    const html = renderPage(event, 'versus');
    expect(html).toContain('class="speech-carousel"');
    expect(html).toContain('aria-label="逐句字幕"');
    expect(html).toContain('论证完整。');
  });

  it('keeps the host announcement in the existing bottom caption position', () => {
    const event: StageEvent = { ...meta, view: { ...view, gameKey: 'werewolf' }, kind: 'narration', text: '【停顿】现在开始投票。' };
    const html = renderPage(event, 'circle');
    expect(html).toContain('aria-label="逐句字幕"');
    expect(html).toContain('主持人');
    expect(html.match(/aria-live="polite"/g)).toHaveLength(1);
  });
});
