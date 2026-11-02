import type { GameResult } from '@battle/shared';
import { END_PHASE, RETURN_PHASE } from '../compiler/compile';
import { executorFor } from '../phases/registry';
import type { PhaseResult } from '../spec/context';
import type { NextSpec, Transition } from '../spec/phases';
import { cloneJson, deepFreeze } from '../utils/json';
import { budgetLimits } from './budget';
import type { ExecEnv } from './env';
import type { ResumeTarget } from './types';

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

function budgetEnd(env: ExecEnv, message: string): void {
  env.log({ kind: 'narration', text: message, channel: 'host' });
  finishGame(env, 'budget');
}

/**
 * 前往目标阶段：若有排队的触发器，先插入触发器的阶段链，目标留到 return 时再去。
 * 只在主流程上（阶段栈为空）取队列：一条链内部的转换（如开枪 → 结算）不会被别的触发器插队，
 * 链 return 回到主流程时再按排队顺序逐条执行。
 */
function moveTo(env: ExecEnv, target: ResumeTarget): void {
  const { s } = env;
  const queued = s.stack.length === 0 ? s.triggerQueue.shift() : undefined;
  if (queued) {
    if (s.stack.length >= budgetLimits(env.game).maxStackDepth) {
      budgetEnd(env, `触发器嵌套超过上限，按预算终局`);
      return;
    }
    s.stack.push(deepFreeze({ resume: target, trigger: s.activeTrigger }));
    s.activeTrigger = queued.event;
    s.cursor = emptyCursor(queued.phaseId);
    return;
  }
  if (target.round) {
    s.round += 1;
    const { maxRounds } = budgetLimits(env.game);
    if (maxRounds !== null && s.round > maxRounds) {
      s.round = maxRounds;
      finishGame(env, 'budget');
      return;
    }
  }
  if (target.goto === END_PHASE) finishGame(env, 'normal');
  else s.cursor = emptyCursor(target.goto);
}

/**
 * 胜负判定只在主流程（阶段栈为空）且没有排队的触发器时进行：已触发的出局连锁
 * （遗言、殉情、开枪、移交警徽……）先全部结算，再看胜负——猎人在天亮出局后开枪带走狼人，
 * 可能推翻"狼人票数已占优势"的结论。命中后清空阶段栈与队列，转入 gameOver.goto（只触发一次）。
 */
function checkGameOver(env: ExecEnv, result: PhaseResult | null): boolean {
  const { s } = env;
  const gameOver = env.game.spec.gameOver;
  if (!gameOver || s.gameOverTriggered || s.stack.length > 0 || s.triggerQueue.length > 0) return false;
  if (!gameOver.when(env.ctx(result))) return false;
  s.gameOverTriggered = true;
  s.stack = [];
  s.triggerQueue = [];
  s.jump = null;
  s.activeTrigger = null;
  s.cursor = emptyCursor(null);
  moveTo(env, { goto: gameOver.goto, round: false });
  return true;
}

/** 进入当前阶段；超过进入上限时按预算终局并返回 false */
export function enterPhase(env: ExecEnv): boolean {
  const { s } = env;
  const phaseId = env.phaseId();
  const phase = env.phase();
  const visit = (s.visits[phaseId] ?? 0) + 1;
  const limit = phase.maxVisits ?? budgetLimits(env.game).maxPhaseVisits;
  if (visit > limit) {
    budgetEnd(env, `阶段 ${phaseId} 超过进入上限 ${limit}，按预算终局`);
    return false;
  }
  s.visits[phaseId] = visit;
  s.cursor = { phaseId, entered: true, visit, phaseState: null };
  if (phase.title) env.log({ kind: 'phase_started', title: phase.title });
  executorFor(phase).enter(env, phase);
  return true;
}

/** 插入链 return：弹出阶段栈，恢复进入插入链之前的触发事件，返回链结束后要去的地方 */
function popChain(env: ExecEnv, phaseId: string): ResumeTarget {
  const frame = env.s.stack.pop();
  if (!frame) throw new Error(`阶段 ${phaseId} 在阶段栈为空时 return`);
  env.s.activeTrigger = frame.trigger;
  return frame.resume;
}

export function completePhase(env: ExecEnv, result: PhaseResult | null): void {
  const { s } = env;
  const phaseId = env.phaseId();
  if (result) s.results[phaseId] = deepFreeze(cloneJson(result));
  const transition = resolveNext(env, env.phase().next, result);
  const target: ResumeTarget = transition.goto === RETURN_PHASE
    ? popChain(env, phaseId)
    : { goto: transition.goto, round: transition.round === 'increment' };
  // 先处理 return 再判定：插入链结束、阶段栈重新为空时才轮到判定胜负
  if (checkGameOver(env, result)) return;
  s.cursor = emptyCursor(null);
  moveTo(env, target);
}

/** 执行 jump 触发器：中止当前阶段及其未完成的 AI 请求，清空阶段栈后跳转 */
export function applyJump(env: ExecEnv): void {
  const { s } = env;
  const jump = s.jump;
  if (!jump) return;
  s.jump = null;
  s.pending = [];
  s.stack = [];
  s.triggerQueue = [];
  s.activeTrigger = jump.event;
  s.cursor = emptyCursor(null);
  moveTo(env, { goto: jump.phaseId, round: jump.round });
}

export function finishGame(env: ExecEnv, reason: GameResult['endReason']): void {
  const { s } = env;
  s.pending = [];
  s.stack = [];
  s.triggerQueue = [];
  s.jump = null;
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
