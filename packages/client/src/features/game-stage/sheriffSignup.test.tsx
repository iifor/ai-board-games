import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AudienceView, StageEvent } from '@battle/shared';
import { sheriffSignup } from './animation/sheriffSignup';
import { Stage } from './components/Stage';
import { SentenceCaptions } from './components/SentenceCaptions';
import { meta, view } from './stage.fixtures';
import type { StreamItem } from './types';

const electionView: AudienceView = { ...view, gameKey: 'werewolf', phase: { id: 'sheriff_signup', title: '警长竞选' }, extra: {} };
const signup = (seat: number, joined = true): { readonly event: Extract<StageEvent, { kind: 'action' }>; readonly audio: null } => ({ event: {
  ...meta, view: electionView, seq: seat, phaseId: 'sheriff_signup', kind: 'action', seat,
  targets: joined ? [seat] : [], action: '上警', text: `${seat}号${joined ? '上警参选' : '不上警'}`,
}, audio: null });
const phaseView = (id: string): AudienceView => ({ ...electionView, phase: { id, title: id } });

describe('sheriff signup presentation', () => {
  it('only marks already shown public choices, including the current player', () => {
    const played = [signup(1), signup(2, false)];
    const state = sheriffSignup(electionView, played, signup(3), 2);
    expect([...state.candidates]).toEqual([1, 3]);
    expect(state.choice).toEqual({ seq: 3, seat: 3, joined: true, rate: 2, label: '上警' });
    expect(sheriffSignup(electionView, played, null, 1).candidates.has(3)).toBe(false);
    const hidden = signup(4);
    expect(sheriffSignup(electionView, [{ ...hidden, event: { ...hidden.event, channel: 'private:4' } }], null, 1).candidates.size).toBe(0);
  });

  it('keeps badges through speeches and PK, removes withdrawals, and clears on resolution', () => {
    const withdraw: StageEvent = { ...signup(1).event, phaseId: 'sheriff_withdraw', seq: 4, action: '退水' };
    const stay: StageEvent = { ...signup(2).event, phaseId: 'sheriff_withdraw', seq: 5, action: '退水', targets: [] };
    const played = [signup(1), signup(2), { event: withdraw, audio: null }, { event: stay, audio: null }];
    for (const phase of ['sheriff_speech', 'sheriff_withdraw', 'sheriff_vote', 'sheriff_pk_speech', 'sheriff_pk_vote']) {
      expect([...sheriffSignup(phaseView(phase), played, null, 1).candidates]).toEqual([2]);
    }
    for (const phase of ['sheriff_resolve', 'dawn', 'day_speech']) {
      expect(sheriffSignup(phaseView(phase), played, null, 1).candidates.size).toBe(0);
    }
    expect(sheriffSignup({ ...electionView, round: 2 }, played, null, 1).candidates.size).toBe(0);
    const restarted: StreamItem = { event: { ...meta, view: electionView, kind: 'phase_started', phaseId: 'sheriff_signup', title: '警长竞选', seq: 6 }, audio: null };
    expect(sheriffSignup(electionView, [...played, restarted], null, 1).candidates.size).toBe(0);
    expect(sheriffSignup(view, played, null, 1).candidates.size).toBe(0);
    expect(sheriffSignup({ ...electionView, status: 'completed' }, played, null, 1).candidates.size).toBe(0);
  });

  it.each([true, false])('uses only a seat effect and persistent signup icon when joined=%s', (joined) => {
    const current = signup(2, joined);
    const html = renderToStaticMarkup(<Stage layout="circle" view={electionView} played={[signup(1)]} current={current} />);
    expect(html).toContain(`data-joined="${joined}"`);
    expect(html).toContain(`aria-label="2号${joined ? '上警' : '不上警'}"`);
    expect(html.match(/class="signup-badge"/g)).toHaveLength(joined ? 2 : 1);
    expect(html).not.toContain('skill-effect');
    expect(html).not.toContain('speaker-spotlight');
    expect(renderToStaticMarkup(<SentenceCaptions item={current} control={null} />)).toBe('');
  });

  it.each([true, false])('shows withdrawal on the actor and updates their badge immediately (withdraw=%s)', (withdraw) => {
    const current = { event: { ...signup(2).event, seq: 3, phaseId: 'sheriff_withdraw', action: '退水',
      targets: withdraw ? [2] : [], view: phaseView('sheriff_withdraw') }, audio: null };
    const played = [signup(1), signup(2)];
    const state = sheriffSignup(current.event.view, played, current, 2);
    expect([...state.candidates]).toEqual(withdraw ? [1] : [1, 2]);
    expect(state.choice).toMatchObject({ seat: 2, joined: !withdraw, label: withdraw ? '退水' : '继续竞选', rate: 2 });
    const html = renderToStaticMarkup(<Stage layout="circle" view={current.event.view} current={current} played={played} />);
    expect(html).toContain(`aria-label="2号${withdraw ? '退水' : '继续竞选'}"`);
    expect(html).toContain(`data-choice="${withdraw ? '退水' : '继续竞选'}"`);
    expect(html.match(/class="signup-badge"/g)).toHaveLength(withdraw ? 1 : 2);
    expect(html).not.toContain('skill-effect');
    expect(html).not.toContain('speaker-spotlight');
    expect(renderToStaticMarkup(<SentenceCaptions item={current} control={null} />)).toBe('');
    expect(sheriffSignup(current.event.view, [...played, current], null, 1).candidates.has(2)).toBe(!withdraw);
  });
});
