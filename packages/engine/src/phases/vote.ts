import type { VoteBallot, VoteOutcome } from '@battle/shared';
import { z } from 'zod';
import type { ExecEnv } from '../runtime/env';
import { toSeatNumbers } from '../runtime/seats';
import type { VotePhase } from '../spec/phases';
import { tallyBallots } from './tally';
import { done, issue, type AiPhaseExecutor, type StepOutcome } from './types';

interface VoteState {
  stage: number;
  readonly voters: number[];
  candidates: Record<string, number[]>;
  ballots: Record<string, number>;
  issued: boolean;
}

interface VoteOutput {
  readonly target: number;
}

type Phase = VotePhase<unknown, unknown>;

function ballotsOf(state: VoteState): VoteBallot[] {
  return state.voters
    .filter((voter) => state.ballots[String(voter)] !== undefined)
    .map((voter) => ({ voter, target: state.ballots[String(voter)] as number, weight: 1 }));
}

function finalize(env: ExecEnv, phase: Phase, outcome: VoteOutcome, title: string): StepOutcome {
  const state = env.phaseState<VoteState>();
  const ballots = ballotsOf(state);
  const tally = tallyBallots(ballots);
  env.log({
    kind: 'vote_tallied',
    title,
    runoff: state.stage,
    ballots,
    tally: tally.rows,
    tied: tally.top.length > 1 ? tally.top : [],
    outcome,
    channel: phase.channel ?? 'public',
  });
  if (phase.onResult === 'eliminate' && outcome.kind === 'selected') {
    env.eliminate(outcome.seat, phase.eliminateReason ?? `${title}出局`);
  }
  const result = { kind: 'vote', outcome, rounds: state.stage + 1 } as const;
  if (phase.apply) env.setState(phase.apply(env.ctx(result), outcome));
  return done(result);
}

function resolve(env: ExecEnv, phase: Phase): StepOutcome {
  const state = env.phaseState<VoteState>();
  const title = phase.title ?? env.phaseId();
  const { top, rows } = tallyBallots(ballotsOf(state));
  const [leader] = top;
  if (top.length === 1 && leader !== undefined) return finalize(env, phase, { kind: 'selected', seat: leader, byTieBreak: false }, title);
  if (top.length === 0) return finalize(env, phase, { kind: 'none' }, title);

  if (state.stage < phase.tie.runoff) {
    env.log({
      kind: 'vote_tallied',
      title,
      runoff: state.stage,
      ballots: ballotsOf(state),
      tally: rows,
      tied: top,
      outcome: null,
      channel: phase.channel ?? 'public',
    });
    state.stage += 1;
    state.candidates = Object.fromEntries(
      state.voters.map((voter) => [String(voter), (state.candidates[String(voter)] ?? []).filter((seat) => top.includes(seat))]),
    );
    state.ballots = {};
    state.issued = false;
    return voteExecutor.step(env, phase);
  }
  if (phase.tie.then === 'none') return finalize(env, phase, { kind: 'none' }, title);
  const picked = env.ctx().random(`tiebreak:${state.stage}`).pick(top);
  return finalize(env, phase, { kind: 'selected', seat: picked, byTieBreak: true }, title);
}

export const voteExecutor: AiPhaseExecutor<Phase> = {
  enter(env, phase) {
    const ctx = env.ctx();
    const voters = toSeatNumbers(phase.voters(ctx));
    const candidates = Object.fromEntries(
      voters.map((voter) => [String(voter), toSeatNumbers(phase.candidates(ctx, env.seat(voter)))]),
    );
    env.setPhaseState<VoteState>({ stage: 0, voters, candidates, ballots: {}, issued: false });
  },

  step(env, phase) {
    const state = env.phaseState<VoteState>();
    if (state.issued) return resolve(env, phase);
    state.issued = true;
    const drafts = state.voters
      .filter((voter) => (state.candidates[String(voter)] ?? []).length > 0)
      .map((voter) => ({
        slot: `r${state.stage}:${voter}`,
        seat: voter,
        action: 'vote' as const,
        template: phase.prompt,
        vars: { runoff: state.stage },
        legalTargets: state.candidates[String(voter)] ?? [],
      }));
    return drafts.length ? issue(drafts) : resolve(env, phase);
  },

  schema() {
    return z.object({
      target: z.number().int().describe('投票对象的座位号，必须是合法目标之一'),
      reason: z.string().max(300).optional().describe('简短理由'),
    });
  },

  check(_env, _phase, pending, value) {
    const { target } = value as VoteOutput;
    return (pending.legalTargets ?? []).includes(target) ? null : `${target} 不是合法的投票对象`;
  },

  fallback(env, _phase, pending) {
    return { target: env.ctx().random(`fallback:${pending.id}`).pick(pending.legalTargets ?? []) };
  },

  store(env, _phase, pending, value) {
    env.phaseState<VoteState>().ballots[String(pending.seat)] = (value as VoteOutput).target;
  },
};
