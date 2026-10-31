import { expectResult, type RuleContext, type Seat, type SetupContext, type SpeakTurn } from '@battle/engine';
import { debatePrompts } from './prompts';
import { DEBATE_SIDES, type DebateParams, type DebateSide, type DebateState } from './state';
import { DEBATE_TOPICS } from './topics';

type DebateContext = RuleContext<DebateState, DebateParams>;

const POSITION_NAMES = ['一', '二', '三', '四'] as const;

/** 攻辩四组：[提问方, 席位] → [回答方, 席位] */
const CROSSFIRE_PAIRS: readonly (readonly [DebateSide, number, DebateSide, number])[] = [
  ['pro', 2, 'con', 2],
  ['con', 2, 'pro', 3],
  ['pro', 3, 'con', 3],
  ['con', 3, 'pro', 2],
];

export function pickTopic(ctx: SetupContext<DebateParams>): DebateState {
  return { topic: ctx.params.topic ?? ctx.random('topic').pick(DEBATE_TOPICS) };
}

export function debateSeatLabel(seat: Seat): string {
  if (seat.role === 'pro' || seat.role === 'con') {
    const position = seat.position === null ? '' : `${POSITION_NAMES[seat.position - 1] ?? seat.position}辩`;
    return `${seat.seat}号 ${seat.profile.name}（${DEBATE_SIDES[seat.role]}${position}）`;
  }
  return `${seat.seat}号 ${seat.profile.name}（评委）`;
}

function debater(ctx: DebateContext, side: DebateSide, position: number): Seat {
  return ctx.seats.inTeam(side).position(position);
}

export function openingSpeakers(ctx: DebateContext): Seat[] {
  return [debater(ctx, 'pro', 1), debater(ctx, 'con', 1)];
}

export function crossfireTurns(ctx: DebateContext): SpeakTurn[] {
  return CROSSFIRE_PAIRS.flatMap(([askerSide, askerPosition, targetSide, targetPosition]) => {
    const asker = debater(ctx, askerSide, askerPosition);
    const target = debater(ctx, targetSide, targetPosition);
    return [
      { seat: asker, prompt: debatePrompts.crossfireQuestion, vars: { targetLabel: debateSeatLabel(target) } },
      { seat: target, prompt: debatePrompts.crossfireAnswer, vars: { askerLabel: debateSeatLabel(asker) } },
    ];
  });
}

export function closingSpeakers(ctx: DebateContext): Seat[] {
  return [debater(ctx, 'con', 4), debater(ctx, 'pro', 4)];
}

const WINNER_LABELS: Readonly<Record<string, string>> = { pro: '正方胜出', con: '反方胜出', draw: '双方平局' };

export function debateResult(ctx: DebateContext) {
  const judging = expectResult(ctx.results, 'judging', 'judge');
  const mvpVote = expectResult(ctx.results, 'mvp', 'vote');
  const mvp = mvpVote.outcome.kind === 'selected' ? mvpVote.outcome.seat : null;
  const winnerLabel = WINNER_LABELS[judging.verdict] ?? judging.verdict;
  const mvpLabel = mvp === null ? '无' : debateSeatLabel(ctx.seats.get(mvp));
  return {
    winner: judging.verdict,
    winnerLabel,
    summary: `${winnerLabel}（评委 ${judging.counts.pro ?? 0}:${judging.counts.con ?? 0}），最佳辩手：${mvpLabel}`,
    mvp,
  };
}
