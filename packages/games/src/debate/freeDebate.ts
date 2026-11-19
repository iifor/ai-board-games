import { stripSpeechTags, type RuleContext, type Seat, type SpeakTurn } from '@battle/engine';
import { z } from 'zod';
import { DEBATE_SIDES, type DebateParams, type DebateSide, type DebateState, type FreeDebate } from './state';

type Context = RuleContext<DebateState, DebateParams>;
const TEAM_BUDGET = 1000;
const FIRST_TURN = 100;
const TURN_LIMIT = 150;
const MIN_TEAM_REMAINING = 20;
const seatHint = z.number().int().min(1).max(8).nullish().catch(null);
export const freeSpeechOutput = z.object({
  speech: z.string().trim().min(1),
  questionTo: seatHint.describe('直接追问的对方座号，开放问题可省略'),
  recommend: seatHint.describe('推荐本方下一位辩手的座号，可省略'),
});

function initial(): FreeDebate {
  const team = () => ({ remaining: TEAM_BUDGET, turns: [], failedSeats: [], recommendation: null });
  return { pro: team(), con: team(), next: 'pro', questionTo: null, lastPass: null, finished: false };
}
const opposite = (side: DebateSide) => side === 'pro' ? 'con' : 'pro';
const lengthOf = (speech: string) => [...stripSpeechTags(speech).trim()].length;

function allowance(ctx: Context, game: FreeDebate, side: DebateSide, seat: number) {
  const team = game[side];
  const reserved = ctx.seats.inTeam(side).ids().filter(id => id !== seat && !team.turns.includes(id)).length * FIRST_TURN;
  return Math.min(TURN_LIMIT, team.remaining - reserved);
}

function candidates(ctx: Context, game: FreeDebate, side: DebateSide) {
  if (game[side].remaining < MIN_TEAM_REMAINING) return [];
  const { turns, failedSeats } = game[side];
  return ctx.seats.inTeam(side).ids().filter(id => !failedSeats.includes(id)
    && !(turns.at(-1) === id && turns.at(-2) === id) && allowance(ctx, game, side, id) > 0);
}

export function freeDebateTurn(ctx: Context): SpeakTurn[] {
  const game = ctx.state.freeDebate ?? initial();
  if (game.finished) return [];
  let side = game.next;
  let pool = candidates(ctx, game, side);
  if (!pool.length) {
    side = opposite(side);
    if (game.lastPass === side) return [];
    pool = candidates(ctx, game, side);
  }
  if (!pool.length) return [];
  const team = game[side];
  let seat = game.questionTo;
  if (seat === null || !pool.includes(seat)) {
    const fresh = pool.filter(id => !team.turns.includes(id));
    const ids = fresh.length ? fresh : pool;
    const weights = ids.map(id => (team.recommendation === id ? 2 : 1) / (1 + team.turns.filter(s => s === id).length));
    let draw = ctx.random('free-debate:' + (game.pro.turns.length + game.con.turns.length)).next() * weights.reduce((a, b) => a + b, 0);
    seat = ids[ids.length - 1]!;
    for (const [i, id] of ids.entries()) {
      draw -= weights[i]!;
      if (draw < 0) {
        seat = id;
        break;
      }
    }
  }
  const maxChars = allowance(ctx, game, side, seat);
  const other = opposite(side);
  const asker = game[other].turns.at(-1);
  const target = game.questionTo;
  let replyContext = '';
  if (side === game.next && target !== null && seat !== target && asker !== undefined) {
    replyContext = `你是${DEBATE_SIDES[side]}${seat}号，本方立场是「${ctx.state.topic[side]}」。本轮请替${DEBATE_SIDES[side]}${target}号回答${DEBATE_SIDES[other]}${asker}号的追问。${game.questionText ? '对方刚才说：「' + game.questionText + '」。' : ''}`;
  }
  const suggested = maxChars < 60 ? `最多 ${maxChars} 字` : `60～${Math.min(120, maxChars)} 字`;
  return [{ seat, maxChars, vars: { remaining: team.remaining, opponentRemaining: game[other].remaining, suggested, replyContext, minRemaining: MIN_TEAM_REMAINING,
    opposition: ctx.seats.inTeam(opposite(side)).ids().join('、'), teammates: ctx.seats.inTeam(side).ids().join('、') } }];
}

export function validateFreeSpeech(value: { speech: string }, ctx: Context, seat: Seat) {
  const game = ctx.state.freeDebate ?? initial();
  const limit = allowance(ctx, game, seat.team as DebateSide, seat.seat);
  const length = lengthOf(value.speech);
  return length > 0 && length <= limit ? null : `speech 正文为 ${length} 字，本轮需要 1～${limit} 字，或填 null 主动让过`;
}

export function settleFreeTurn(ctx: Context, actor: Seat, output: { speech: string | null } | null): DebateState {
  const game = ctx.state.freeDebate ?? initial();
  const side = actor.team as DebateSide;
  const other = opposite(side);
  const team = game[side];
  const spoken = output?.speech ? freeSpeechOutput.parse(output) : null;
  const passed = output?.speech === null;
  const question = spoken?.questionTo;
  const questionTo = question && ctx.seats.inTeam(other).has(question) ? question : null;
  const recommendation = spoken?.recommend;
  return { ...ctx.state, freeDebate: { ...game, next: other,
    lastPass: passed ? side : null, finished: passed && game.lastPass === other,
    questionTo, questionText: questionTo && spoken ? stripSpeechTags(spoken.speech).trim() : null,
    [side]: { remaining: team.remaining - (spoken ? lengthOf(spoken.speech) : 0),
      turns: [...team.turns, actor.seat],
      failedSeats: output === null ? [...team.failedSeats, actor.seat] : spoken ? [] : team.failedSeats,
      recommendation: recommendation && ctx.seats.inTeam(side).has(recommendation) ? recommendation : null },
  } };
}
