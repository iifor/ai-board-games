import type { ActDecision, ComputeOutcome, Seat, VoteOutcome } from '@battle/engine';
import type { WerewolfState } from '../state';
import { seededRotation, type WerewolfContext } from './context';

export const SHERIFF_VOTE_WEIGHT = 1.5;

function chosen(decisions: readonly ActDecision[]): number[] {
  return decisions.filter((decision) => decision.targets.length > 0).map((decision) => decision.seat);
}

export function applySignup(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  return { ...ctx.state, sheriffCandidates: chosen(decisions).sort((a, b) => a - b) };
}

export function applyWithdraw(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const withdrawn = new Set(chosen(decisions));
  return { ...ctx.state, sheriffCandidates: ctx.state.sheriffCandidates.filter((seat) => !withdrawn.has(seat)) };
}

export function signedUp(ctx: WerewolfContext): number[] {
  const signup = ctx.results.sheriff_signup;
  return signup?.kind === 'act' ? chosen(signup.decisions) : [];
}

function withdrawn(ctx: WerewolfContext): number[] {
  return signedUp(ctx).filter((seat) => !ctx.state.sheriffCandidates.includes(seat));
}

/** 竞选发言顺序：种子决定 */
export function campaignOrder(ctx: WerewolfContext): number[] {
  return ctx.random('campaign-order').shuffle(ctx.state.sheriffCandidates);
}

/** 上过警的玩家（包括退水者）不能投票 */
export function sheriffVoters(ctx: WerewolfContext): Seat[] {
  return ctx.seats.alive().except(...signedUp(ctx)).list().slice();
}

export function pkCandidates(ctx: WerewolfContext): number[] {
  const vote = ctx.results.sheriff_vote;
  return vote?.kind === 'vote' ? [...vote.tied] : [];
}

export function pkOrder(ctx: WerewolfContext): number[] {
  return seededRotation(ctx, pkCandidates(ctx), 'pk-order');
}

/** PK 投票：除 PK 候选人与退水者外的存活玩家都可以投 */
export function pkVoters(ctx: WerewolfContext): Seat[] {
  return ctx.seats.alive().except(...pkCandidates(ctx), ...withdrawn(ctx)).list().slice();
}

export function recordSheriffVote(ctx: WerewolfContext, outcome: VoteOutcome): WerewolfState {
  return outcome.kind === 'selected' ? { ...ctx.state, sheriff: outcome.seat } : ctx.state;
}

/** 唯一候选人自动当选；否则以投票结果为准；都没有则警徽流失 */
export function resolveSheriff(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const candidates = ctx.state.sheriffCandidates;
  const only = candidates.length === 1 ? candidates[0] ?? null : null;
  const sheriff = ctx.state.sheriff ?? only;
  const text = sheriff === null ? '警长竞选结束，本局没有警长。' : `${sheriff}号当选警长。`;
  return { state: { ...ctx.state, sheriff, sheriffCandidates: [] }, log: [{ kind: 'narration', text }] };
}

export function sheriffWeight(ctx: WerewolfContext, voter: Seat): number {
  return voter.seat === ctx.state.sheriff ? SHERIFF_VOTE_WEIGHT : 1;
}

/** 放逐投票的票权：警长 1.5 票；祈求到平民的祈求者再多 1 票（两者叠加） */
export function exileWeight(ctx: WerewolfContext, voter: Seat): number {
  const doubled = voter.role === 'requester' && ctx.state.requesterGift === 'double';
  return sheriffWeight(ctx, voter) + (doubled ? 1 : 0);
}

export function applyBadgeTransfer(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  return { ...ctx.state, sheriff: decisions.flatMap((decision) => decision.targets)[0] ?? null };
}

export function describeBadgeTransfer(_ctx: WerewolfContext, _seat: Seat, targets: readonly number[]): string {
  const [successor] = targets;
  return successor === undefined ? '撕毁警徽' : `将警徽移交给 ${successor}号`;
}
