import type { AudienceSeat, AudienceView, StageEvent } from '@battle/shared';
import { TEAM_LABELS } from './constants';
import type { StreamItem } from './types';

export type StagePeriod = 'day' | 'night';

/** 昼夜：优先用游戏在观众视图里给出的 period；没有时按阶段标题推断（只有狼人杀有夜晚） */
export function periodOf(view: AudienceView | null): StagePeriod {
  if (!view) return 'night';
  if (view.extra.period === 'day' || view.extra.period === 'night') return view.extra.period;
  if (view.gameKey !== 'werewolf') return 'day';
  return /夜|天黑/.test(view.phase?.title ?? '') ? 'night' : 'day';
}

export function seatOf(view: AudienceView | null, seat: number | null): AudienceSeat | null {
  return seat === null ? null : (view?.seats.find((candidate) => candidate.seat === seat) ?? null);
}

export function roundLabel(view: AudienceView): string {
  return `第 ${view.round} ${view.gameKey === 'werewolf' ? '天' : '轮'}`;
}

export function teamLabel(team: string | null): string {
  return team === null ? '未知' : (TEAM_LABELS[team] ?? team);
}

export const KIND_LABELS: Readonly<Record<StageEvent['kind'], string>> = {
  phase_started: '阶段',
  narration: '主持播报',
  speech: '发言',
  action: '行动',
  vote_tallied: '计票',
  judgement: '评委点评',
  seat_eliminated: '出局',
  revealed: '揭示',
  fallback: '兜底',
  game_over: '终局',
};

/** 这些事件播放时把说话人的立绘放到舞台中央 */
export function hasSpotlight(kind: StageEvent['kind']): boolean {
  return kind === 'speech' || kind === 'judgement' || kind === 'narration' || kind === 'revealed' || kind === 'game_over';
}

/** 本轮夜晚已经走过的阶段标题（含当前），只用公开的 phase_started 事件 */
export function nightStepsOf(played: readonly StreamItem[], current: StreamItem | null, view: AudienceView | null): readonly string[] {
  if (!view || periodOf(view) !== 'night') return [];
  const items = current ? [...played, current] : played;
  const steps: string[] = [];
  for (const { event } of items) {
    if (event.kind !== 'phase_started' || event.round !== view.round || periodOf(event.view) !== 'night') continue;
    if (steps[steps.length - 1] !== event.title) steps.push(event.title);
  }
  return steps;
}

/** 当前阶段里已经发言（或点评）的座位，含正在发言的 */
export function speechOrderOf(played: readonly StreamItem[], current: StreamItem | null, view: AudienceView | null): readonly number[] {
  if (!view?.phase) return [];
  const items = current ? [...played, current] : played;
  const seats: number[] = [];
  for (const { event } of items) {
    if (event.kind !== 'speech' && event.kind !== 'judgement') continue;
    if (event.round !== view.round || event.phaseId !== view.phase.id || seats.includes(event.seat)) continue;
    seats.push(event.seat);
  }
  return seats;
}

/** 评委已经给出的判定：座位 → 判定文字 */
export function judgeBadges(played: readonly StreamItem[]): Readonly<Record<number, readonly string[]>> {
  const badges: Record<number, string[]> = {};
  for (const { event } of played) if (event.kind === 'judgement') badges[event.seat] = [event.verdictLabel];
  return badges;
}

export interface TeamRoster {
  readonly team: string | null;
  readonly label: string;
  readonly seats: readonly AudienceSeat[];
}

/** 终局阵容：按阵营分组，保持座位顺序 */
export function rosterByTeam(view: AudienceView): readonly TeamRoster[] {
  const groups = new Map<string | null, AudienceSeat[]>();
  for (const seat of view.seats) {
    const list = groups.get(seat.team) ?? [];
    list.push(seat);
    groups.set(seat.team, list);
  }
  return [...groups.entries()].map(([team, seats]) => ({ team, label: teamLabel(team), seats }));
}
