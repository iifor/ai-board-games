import type { AiPhaseSpec, PhaseKind, PhaseSpec } from '../spec/phases';
import { actExecutor } from './act';
import { judgeExecutor } from './judge';
import { announceExecutor, computeExecutor, revealExecutor } from './simple';
import { speakExecutor } from './speak';
import type { AiPhaseExecutor, PhaseExecutor } from './types';
import { voteExecutor } from './vote';

type AnyPhase = PhaseSpec<unknown, unknown>;
type ExecutorMap = { readonly [K in PhaseKind]: PhaseExecutor<Extract<AnyPhase, { readonly kind: K }>> };

const EXECUTORS: ExecutorMap = {
  announce: announceExecutor,
  speak: speakExecutor,
  act: actExecutor,
  vote: voteExecutor,
  judge: judgeExecutor,
  compute: computeExecutor,
  reveal: revealExecutor,
};

const AI_KINDS: ReadonlySet<PhaseKind> = new Set(['speak', 'act', 'vote', 'judge']);

// 映射类型无法让 TS 关联 phase.kind 与执行器的参数类型，这里在唯一出口处收窄
export function executorFor(phase: AnyPhase): PhaseExecutor<AnyPhase> {
  return EXECUTORS[phase.kind] as PhaseExecutor<AnyPhase>;
}

export function isAiPhase(phase: AnyPhase): phase is AiPhaseSpec<unknown, unknown> {
  return AI_KINDS.has(phase.kind);
}

export function aiExecutorFor(phase: AnyPhase): AiPhaseExecutor<AnyPhase> {
  if (!isAiPhase(phase)) throw new Error(`阶段类型 ${phase.kind} 不接受 AI 输出`);
  return EXECUTORS[phase.kind] as AiPhaseExecutor<AnyPhase>;
}
