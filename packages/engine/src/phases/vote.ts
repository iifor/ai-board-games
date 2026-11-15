import type { SystemChoice, VoteBallot, VoteOutcome } from '@battle/shared';
import { z } from 'zod';
import type { ExecEnv } from '../runtime/env';
import { toSeatNumbers } from '../runtime/seats';
import type { VotePhase } from '../spec/phases';
import { seatNumber } from './seatNumber';
import { tallyBallots, type Tally } from './tally';
import { done, issue, type AiPhaseExecutor, type RequestDraft, type StepOutcome } from './types';

interface VoteState {
  stage: number;
  readonly voters: number[];
  readonly weights: Record<string, number>;
  candidates: Record<string, number[]>;
  /** 座位 → 目标；null 为弃票 */
  ballots: Record<string, number | null>;
  ballotRequests?: Record<string, string>;
  systemChoices?: Record<number, SystemChoice>;
  /** 额外票：座位 → 票数（进入阶段时确定；旧快照中可能没有） */
  readonly bonus?: Record<string, number>;
  issued: boolean;
}

interface VoteOutput {
  readonly target: number | null;
}

type Phase = VotePhase<unknown, unknown>;

function ballotsOf(state: VoteState): VoteBallot[] {
  return state.voters.flatMap((voter) => {
    const target = state.ballots[String(voter)];
    return typeof target === 'number' ? [{ voter, target, weight: state.weights[String(voter)] ?? 1 }] : [];
  });
}

function abstainersOf(state: VoteState): number[] {
  return state.voters.filter((voter) => state.ballots[String(voter)] === null);
}

/** 本轮计票：额外票只计给本轮仍是候选人的座位 */
function tallyRound(state: VoteState): Tally {
  const open = new Set(Object.values(state.candidates).flat());
  const bonus = Object.fromEntries(Object.entries(state.bonus ?? {}).filter(([seat]) => open.has(Number(seat))));
  return tallyBallots(ballotsOf(state), bonus);
}

function finalize(env: ExecEnv, phase: Phase, outcome: VoteOutcome, tied: readonly number[]): StepOutcome {
  const state = env.phaseState<VoteState>();
  const title = phase.title ?? env.phaseId();
  const ballots = ballotsOf(state);
  const requestIds = Object.values(state.ballotRequests ?? {});
  env.log({
    kind: 'vote_tallied',
    title,
    runoff: state.stage,
    ballots,
    abstained: abstainersOf(state),
    ...(state.systemChoices && { systemChoices: state.systemChoices }),
    tally: tallyRound(state).rows,
    tied: [...tied],
    outcome,
    channel: phase.channel ?? 'public',
  }, requestIds);
  if (phase.onResult === 'eliminate' && outcome.kind === 'selected') {
    env.eliminate(outcome.seat, phase.eliminateReason ?? `${title}出局`, phase.eliminateCause ?? env.phaseId(), requestIds);
  }
  const result = { kind: 'vote', outcome, rounds: state.stage + 1, tied: [...tied], ballots } as const;
  if (phase.apply) env.setState(phase.apply(env.ctx(result), outcome));
  return done(result);
}

function startRunoff(env: ExecEnv, phase: Phase, tied: readonly number[]): StepOutcome {
  const state = env.phaseState<VoteState>();
  const ballots = ballotsOf(state);
  env.log({
    kind: 'vote_tallied',
    title: phase.title ?? env.phaseId(),
    runoff: state.stage,
    ballots,
    abstained: abstainersOf(state),
    ...(state.systemChoices && { systemChoices: state.systemChoices }),
    tally: tallyRound(state).rows,
    tied: [...tied],
    outcome: null,
    channel: phase.channel ?? 'public',
  }, Object.values(state.ballotRequests ?? {}));
  state.stage += 1;
  state.candidates = Object.fromEntries(
    state.voters.map((voter) => [String(voter), (state.candidates[String(voter)] ?? []).filter((seat) => tied.includes(seat))]),
  );
  state.ballots = {};
  state.ballotRequests = {};
  delete state.systemChoices;
  state.issued = false;
  return voteExecutor.step(env, phase);
}

function resolve(env: ExecEnv, phase: Phase): StepOutcome {
  const state = env.phaseState<VoteState>();
  const { top } = tallyRound(state);
  const [leader] = top;
  if (top.length === 1 && leader !== undefined) return finalize(env, phase, { kind: 'selected', seat: leader, byTieBreak: false }, []);
  if (top.length === 0) return finalize(env, phase, { kind: 'none' }, []);
  if (state.stage < phase.tie.runoff) return startRunoff(env, phase, top);
  if (phase.tie.then === 'none') return finalize(env, phase, { kind: 'none' }, top);
  const picked = env.ctx().random(`tiebreak:${state.stage}`).pick(top);
  return finalize(env, phase, { kind: 'selected', seat: picked, byTieBreak: true }, top);
}

export const voteExecutor: AiPhaseExecutor<Phase> = {
  enter(env, phase) {
    const ctx = env.ctx();
    const voters = toSeatNumbers(phase.voters(ctx));
    const entries = voters.map((voter) => {
      const seat = env.seat(voter);
      const weight = phase.weight?.(ctx, seat) ?? 1;
      if (!(weight > 0)) throw new Error(`阶段 ${env.phaseId()} 给 ${voter}号的票权必须为正数，收到 ${weight}`);
      return { voter, weight, candidates: toSeatNumbers(phase.candidates(ctx, seat)) };
    });
    const bonus: Record<string, number> = {};
    for (const { target, votes } of phase.bonus?.(ctx) ?? []) {
      if (!(votes > 0)) throw new Error(`阶段 ${env.phaseId()} 给 ${target}号的额外票必须为正数，收到 ${votes}`);
      bonus[String(target)] = (bonus[String(target)] ?? 0) + votes;
    }
    env.setPhaseState<VoteState>({
      stage: 0,
      voters,
      weights: Object.fromEntries(entries.map(({ voter, weight }) => [String(voter), weight])),
      candidates: Object.fromEntries(entries.map(({ voter, candidates }) => [String(voter), candidates])),
      ballots: {},
      bonus,
      issued: false,
    });
  },

  step(env, phase) {
    const state = env.phaseState<VoteState>();
    if (state.issued) return resolve(env, phase);
    state.issued = true;
    const drafts: RequestDraft[] = [];
    for (const voter of state.voters) {
      const legalTargets = state.candidates[String(voter)] ?? [];
      const [only] = legalTargets;
      if (only === undefined) continue;
      if (legalTargets.length === 1 && !phase.allowAbstain) {
        state.ballots[String(voter)] = only;
        (state.systemChoices ??= {})[voter] = 'only_target';
      } else {
        drafts.push({ slot: `r${state.stage}:${voter}`, seat: voter, action: 'vote',
          template: phase.prompt, vars: { runoff: state.stage }, legalTargets });
      }
    }
    return drafts.length ? issue(drafts) : resolve(env, phase);
  },

  schema(_env, phase) {
    const seat = seatNumber();
    return z.object({
      target: phase.allowAbstain
        ? seat.nullable().describe('投票对象的座位号，必须是合法目标之一；null 表示弃票')
        : seat.describe('投票对象的座位号，必须是合法目标之一'),
      reason: z.string().max(300).optional().describe('简短理由'),
    });
  },

  check(_env, phase, pending, value) {
    const { target } = value as VoteOutput;
    if (target === null) return phase.allowAbstain ? null : '不允许弃票';
    return (pending.legalTargets ?? []).includes(target) ? null : `${target} 不是合法的投票对象`;
  },

  skipFailed(env, phase, pending) {
    const abstention = { target: null };
    voteExecutor.store(env, phase, pending, abstention);
    const state = env.phaseState<VoteState>();
    (state.systemChoices ??= {})[pending.seat] = 'request_failed';
    return abstention;
  },

  store(env, _phase, pending, value) {
    const state = env.phaseState<VoteState>();
    state.ballots[String(pending.seat)] = (value as VoteOutput).target;
    if (env.collectTrace) (state.ballotRequests ??= {})[String(pending.seat)] = pending.id;
  },
};
