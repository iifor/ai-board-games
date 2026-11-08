import { isSheriffChoice, isSheriffSignup, type AudienceView } from '@battle/shared';
import type { StreamItem } from '../types';

export interface SignupChoice {
  readonly seq: number;
  readonly seat: number;
  readonly joined: boolean;
  readonly label: '上警' | '不上警' | '退水' | '继续竞选';
  readonly rate: number;
}

const ELECTION_PHASES = new Set([
  'sheriff_signup', 'sheriff_speech', 'sheriff_withdraw', 'sheriff_vote', 'sheriff_pk_speech', 'sheriff_pk_vote',
]);

/** 只采用已经播到的公开选择，避免提前显示预缓冲中的上警结果。 */
export function sheriffSignup(view: AudienceView, played: readonly StreamItem[], current: StreamItem | null, rate: number) {
  const candidates = new Set<number>();
  const event = current?.event;
  let choice: SignupChoice | null = null;
  if (isSheriffChoice(event)) {
    const withdraw = event.phaseId === 'sheriff_withdraw';
    const joined = withdraw ? !event.targets.includes(event.seat) : event.targets.includes(event.seat);
    choice = { seq: event.seq, seat: event.seat, joined, rate,
      label: withdraw ? joined ? '继续竞选' : '退水' : joined ? '上警' : '不上警' };
  }
  if (view.gameKey !== 'werewolf' || view.status !== 'running' || !ELECTION_PHASES.has(view.phase?.id ?? '')) return { candidates, choice: null };
  for (const { event: item } of current ? [...played, current] : played) {
    if (item.view.gameKey !== 'werewolf' || item.channel !== 'public' || item.round !== view.round) continue;
    if (item.kind === 'phase_started' && item.phaseId === 'sheriff_signup') candidates.clear();
    if (isSheriffSignup(item)) {
      if (item.targets.includes(item.seat)) candidates.add(item.seat);
      else candidates.delete(item.seat);
    }
    if (item.kind === 'action' && item.phaseId === 'sheriff_withdraw' && item.targets.includes(item.seat)) candidates.delete(item.seat);
  }
  return { candidates, choice };
}
