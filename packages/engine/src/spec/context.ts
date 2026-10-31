import type { EndReason, VoteOutcome } from '@battle/shared';
import type { Rng } from '../runtime/rng';
import type { SeatQuery } from '../runtime/seats';

export interface ActDecision {
  readonly seat: number;
  readonly targets: readonly number[];
}

export interface Judgement {
  readonly seat: number;
  readonly verdict: string;
  readonly comment: string;
}

/** 阶段完成后的结构化结果，保存在 `ctx.results[phaseId]`（同一阶段多次访问时保留最近一次） */
export type PhaseResult =
  | { readonly kind: 'speak'; readonly speeches: readonly { readonly seat: number; readonly text: string }[] }
  | { readonly kind: 'act'; readonly decisions: readonly ActDecision[] }
  | { readonly kind: 'vote'; readonly outcome: VoteOutcome; readonly rounds: number }
  | {
      readonly kind: 'judge';
      readonly verdict: string;
      readonly counts: Readonly<Record<string, number>>;
      readonly judgements: readonly Judgement[];
    };

export type PhaseResultKind = PhaseResult['kind'];

/** 顶层只读（运行时还会深度冻结）；对 unknown 保持 unknown，便于引擎内部按擦除类型处理 */
export type ReadonlyValue<T> = T extends object ? Readonly<T> : T;

/** 规则函数、条件、选择器拿到的只读上下文 */
export interface RuleContext<S, P> {
  readonly state: ReadonlyValue<S>;
  readonly params: ReadonlyValue<P>;
  readonly seats: SeatQuery;
  readonly round: number;
  readonly phaseId: string | null;
  readonly results: Readonly<Record<string, PhaseResult>>;
  /** 当前阶段的结果：只在阶段完成后（next、apply、onResult）有值 */
  readonly result: PhaseResult | null;
  /** 只在 end 中有意义 */
  readonly endReason: EndReason;
  /** 种子随机数：由主种子、当前阶段、访问次数与标签派生 */
  random(label: string): Rng;
}

export interface SetupContext<P> {
  readonly params: ReadonlyValue<P>;
  readonly seats: SeatQuery;
  random(label: string): Rng;
}
