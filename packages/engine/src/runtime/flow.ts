import type { GameResult } from '@battle/shared';
import { END_PHASE } from '../compiler/compile';
import { executorFor } from '../phases/registry';
import type { PhaseResult } from '../spec/context';
import type { NextSpec, Transition } from '../spec/phases';
import { cloneJson, deepFreeze } from '../utils/json';
import { budgetLimits } from './budget';
import type { ExecEnv } from './env';

function emptyCursor(phaseId: string | null) {
  return { phaseId, entered: false, visit: 0, phaseState: null };
}

function resolveNext(env: ExecEnv, next: NextSpec<unknown, unknown>, result: PhaseResult | null): Transition<unknown, unknown> {
  if (typeof next === 'string') return { goto: next };
  const ctx = env.ctx(result);
  const transition = next.find((item) => !item.when || item.when(ctx));
  if (!transition) throw new Error(`阶段 ${env.phaseId()} 没有匹配的跳转`);
  return transition;
}

/** 进入当前阶段；超过进入上限时按预算终局并返回 false */
export function enterPhase(env: ExecEnv): boolean {
  const { s } = env;
  const phaseId = env.phaseId();
  const phase = env.phase();
  const visit = (s.visits[phaseId] ?? 0) + 1;
  const limit = phase.maxVisits ?? budgetLimits(env.game).maxPhaseVisits;
  if (visit > limit) {
    env.log({ kind: 'narration', text: `阶段 ${phaseId} 超过进入上限 ${limit}，按预算终局`, channel: 'host' });
    finishGame(env, 'budget');
    return false;
  }
  s.visits[phaseId] = visit;
  s.cursor = { phaseId, entered: true, visit, phaseState: null };
  if (phase.title) env.log({ kind: 'phase_started', title: phase.title });
  executorFor(phase).enter(env, phase);
  return true;
}

export function completePhase(env: ExecEnv, result: PhaseResult | null): void {
  const { s } = env;
  const phaseId = env.phaseId();
  if (result) s.results[phaseId] = deepFreeze(cloneJson(result));
  const transition = resolveNext(env, env.phase().next, result);
  s.cursor = emptyCursor(null);

  if (transition.round === 'increment') {
    s.round += 1;
    const { maxRounds } = budgetLimits(env.game);
    if (maxRounds !== null && s.round > maxRounds) {
      s.round = maxRounds;
      finishGame(env, 'budget');
      return;
    }
  }
  if (transition.goto === END_PHASE) finishGame(env, 'normal');
  else s.cursor = emptyCursor(transition.goto);
}

export function finishGame(env: ExecEnv, reason: GameResult['endReason']): void {
  const { s } = env;
  s.pending = [];
  s.cursor = emptyCursor(null);
  const end = env.game.spec.end(env.ctx(null, reason));
  const result: GameResult = {
    winner: end.winner,
    winnerLabel: end.winnerLabel,
    summary: end.summary,
    mvp: end.mvp ?? null,
    endReason: reason,
  };
  s.status = 'completed';
  s.result = result;
  env.log({ kind: 'game_over', result });
}
