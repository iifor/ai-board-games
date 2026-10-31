import { EngineInputError } from '../errors';
import type { ExecEnv } from '../runtime/env';
import { completePhase } from '../runtime/flow';
import type { DebugCommand, EngineSnapshot } from '../runtime/types';

function entryKey(s: EngineSnapshot, phaseId: string): string {
  return `${phaseId}#${(s.visits[phaseId] ?? 0) + 1}`;
}

/** 调试局在进入阶段前判断是否暂停 */
export function shouldPauseBeforeEnter(s: EngineSnapshot): boolean {
  const { debug } = s;
  const phaseId = s.cursor.phaseId;
  if (!debug || debug.mode === 'run' || phaseId === null) return false;
  const key = entryKey(s, phaseId);
  if (debug.passKey === key) {
    debug.passKey = null;
    return false;
  }
  if (debug.mode === 'step') return true;
  return debug.breakpoints === 'all' || debug.breakpoints.includes(phaseId);
}

/**
 * continue：继续运行到下一个断点；step：执行当前阶段并停在下一个阶段之前；
 * run：关闭所有断点连续运行；skip：不执行当前阶段，直接按 next 跳转。
 */
export function applyDebugCommand(env: ExecEnv, command: DebugCommand): void {
  const { s } = env;
  const { debug } = s;
  if (!debug) throw new EngineInputError('非调试局不接受调试指令');
  if (s.status !== 'paused') throw new EngineInputError('只有暂停时才能执行调试指令');
  const key = entryKey(s, env.phaseId());
  s.status = 'running';

  if (command === 'continue') {
    debug.mode = 'breakpoints';
    debug.passKey = key;
  } else if (command === 'step') {
    debug.mode = 'step';
    debug.passKey = key;
  } else if (command === 'run') {
    debug.mode = 'run';
  } else {
    env.log({ kind: 'narration', text: `调试：跳过阶段 ${env.phaseId()}`, channel: 'host' });
    completePhase(env, null);
  }
}
