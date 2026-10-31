import { issueDrafts } from '../ai/requests';
import type { CompiledGame } from '../compiler/compile';
import { shouldPauseBeforeEnter } from '../debug/breakpoints';
import { EngineInputError } from '../errors';
import { executorFor } from '../phases/registry';
import { cloneJson, deepFreeze } from '../utils/json';
import { ExecEnv, type Emitted } from './env';
import { applyJump, completePhase, enterPhase, finishGame } from './flow';
import { applyInput } from './input';
import type { AdvanceResult, EngineInput, EngineSnapshot } from './types';

const MAX_STEPS_PER_ADVANCE = 10_000;

/** 工作副本：JSON 拷贝后冻结规则函数会读到的部分 */
function workingCopy(snapshot: EngineSnapshot): EngineSnapshot {
  const s = cloneJson(snapshot);
  deepFreeze(s.seats);
  deepFreeze(s.state);
  deepFreeze(s.params);
  Object.values(s.results).forEach(deepFreeze);
  return s;
}

/** 持续推进，直到需要 AI 输出、命中断点或终局 */
function runUntilBlocked(env: ExecEnv): void {
  const { s } = env;
  for (let step = 0; step < MAX_STEPS_PER_ADVANCE; step += 1) {
    if (s.status !== 'running') return;
    if (s.jump) {
      applyJump(env);
      continue;
    }
    if (s.pending.length > 0) {
      s.status = 'waiting_ai';
      return;
    }
    if (!s.cursor.entered) {
      if (shouldPauseBeforeEnter(s)) {
        s.status = 'paused';
        return;
      }
      if (!enterPhase(env)) return;
    }
    const phase = env.phase();
    const outcome = executorFor(phase).step(env, phase);
    if (outcome.kind === 'done' && s.jump) applyJump(env);
    else if (outcome.kind === 'done') completePhase(env, outcome.result);
    else if (!issueDrafts(env, outcome.drafts)) finishGame(env, 'budget');
  }
  throw new Error(`单次推进超过 ${MAX_STEPS_PER_ADVANCE} 步，spec 中可能存在不消耗 AI 的死循环`);
}

/** 引擎唯一的推进入口：纯函数，不修改传入的快照 */
export function advance(game: CompiledGame, snapshot: EngineSnapshot, input: EngineInput): AdvanceResult {
  if (snapshot.gameKey !== game.spec.key || snapshot.specHash !== game.hash) {
    throw new EngineInputError(`快照属于 ${snapshot.gameKey}@${snapshot.specHash}，与当前游戏定义不匹配`);
  }
  const out: Emitted = { log: [], stageEvents: [], aiRequests: [] };
  const env = new ExecEnv(game, workingCopy(snapshot), out);
  applyInput(env, input);
  runUntilBlocked(env);
  return { snapshot: env.s, log: out.log, stageEvents: out.stageEvents, aiRequests: out.aiRequests, status: env.s.status };
}
