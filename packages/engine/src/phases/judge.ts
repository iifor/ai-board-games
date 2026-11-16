import { z } from 'zod';
import type { ExecEnv } from '../runtime/env';
import { toSeatNumbers } from '../runtime/seats';
import type { Judgement } from '../spec/context';
import type { JudgeFallback, JudgePhase } from '../spec/phases';
import { done, issue, withMaxChars, type AiPhaseExecutor, type StepOutcome } from './types';

interface JudgeState {
  readonly judges: number[];
  next: number;
  readonly judgements: Judgement[];
}

type Phase = JudgePhase<unknown, unknown>;

/** 缺少玩家和阶段篇幅设置时的点评建议字数 */
export const DEFAULT_COMMENT_MAX = 300;

/** 阶段提供的默认篇幅建议 */
function commentMax(phase: Phase): number {
  return phase.commentMax ?? DEFAULT_COMMENT_MAX;
}

function verdictKeys(phase: Phase): [string, ...string[]] {
  const keys = Object.keys(phase.verdicts);
  const [first, ...rest] = keys;
  if (first === undefined) throw new Error('judge 阶段至少需要一个判定选项');
  return [first, ...rest];
}

function aggregate(env: ExecEnv, phase: Phase): StepOutcome {
  const { judgements } = env.phaseState<JudgeState>();
  const counts: Record<string, number> = Object.fromEntries(verdictKeys(phase).map((key) => [key, 0]));
  for (const judgement of judgements) counts[judgement.verdict] = (counts[judgement.verdict] ?? 0) + 1;
  const best = Math.max(0, ...Object.values(counts));
  const leaders = Object.keys(counts).filter((key) => counts[key] === best);
  const [leader] = leaders;
  const verdict = best > 0 && leaders.length === 1 && leader !== undefined ? leader : phase.tieVerdict.key;
  return done({ kind: 'judge', verdict, counts, judgements });
}

export const judgeExecutor: AiPhaseExecutor<Phase> = {
  enter(env, phase) {
    verdictKeys(phase);
    env.setPhaseState<JudgeState>({ judges: toSeatNumbers(phase.judges(env.ctx())), next: 0, judgements: [] });
  },

  step(env, phase) {
    const state = env.phaseState<JudgeState>();
    const seat = state.judges[state.next];
    if (seat === undefined) return aggregate(env, phase);
    const vars = withMaxChars({}, commentMax(phase));
    return issue([{ slot: `j${state.next}`, seat, action: 'judge', template: phase.prompt, vars, legalTargets: null }]);
  },

  schema(_env, phase) {
    const meaning = Object.entries(phase.verdicts).map(([key, label]) => `${key}=${label}`).join('；');
    return z.object({
      verdict: z.enum(verdictKeys(phase)).describe(`判定：${meaning}`),
      comment: z.string().trim().min(1).describe('点评内容'),
    });
  },

  check() {
    return null;
  },

  skipFailed(env, phase, pending) {
    env.log({ kind: 'speech', seat: pending.seat, text: '过~', channel: phase.channel ?? 'public', source: 'fallback' });
    env.phaseState<JudgeState>().next += 1;
    return { verdict: null, comment: '过~' };
  },

  store(env, phase, pending, value) {
    const state = env.phaseState<JudgeState>();
    const { verdict, comment } = value as JudgeFallback;
    env.log({
      kind: 'judgement',
      seat: pending.seat,
      verdict,
      verdictLabel: phase.verdicts[verdict] ?? verdict,
      comment,
      channel: phase.channel ?? 'public',
    });
    state.judgements.push({ seat: pending.seat, verdict, comment });
    state.next += 1;
  },
};
