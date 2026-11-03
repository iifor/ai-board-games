import type { MatchSummaryDto } from '@battle/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { MatchList } from './components/MatchList';

const summary = (id: string): MatchSummaryDto => ({
  id, gameKey: 'werewolf', gameTitle: 'AI 狼人杀', variantKey: 'standard-12', variantName: '预女猎白', layout: 'circle', status: 'completed',
  debug: false, scripted: false, chaos: false, seats: [], result: { winner: 'good', winnerLabel: '好人胜利', summary: '', mvp: null, endReason: 'normal' },
  createdAt: '2026-11-01T12:00:00Z', completedAt: '2026-11-01T12:30:00Z',
});

describe('history list', () => {
  it('staggers rows by index, caps the stagger and carries the replay affordance on every row', () => {
    const matches = Array.from({ length: 13 }, (_, index) => summary(`m_${index}`));
    const html = renderToStaticMarkup(<MemoryRouter><MatchList matches={matches} /></MemoryRouter>);
    expect(html).toContain('style="--i:0"');
    expect(html).toContain('style="--i:9"');
    expect(html).toContain('style="--i:10"');
    expect(html).not.toContain('style="--i:11"');
    expect(html.match(/match-row-replay/g)?.length).toBe(13);
    expect(html).toContain('href="/matches/m_0"');
    expect(html).toContain('好人胜利');
    expect(html).toContain('data-game="werewolf"');
  });
});
