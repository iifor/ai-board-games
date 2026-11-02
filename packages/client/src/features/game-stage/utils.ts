import type { AudienceSeat, AudienceView, StageEvent } from '@battle/shared';

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

/** 这些事件播放时把说话人的立绘推到舞台前景 */
export function hasSpotlight(kind: StageEvent['kind']): boolean {
  return kind === 'speech' || kind === 'judgement' || kind === 'narration' || kind === 'revealed' || kind === 'game_over';
}
