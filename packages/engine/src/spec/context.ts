import type { EndReason, VoteBallot, VoteOutcome } from '@battle/shared';
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

/** 触发器监听的引擎事件；触发后进入的阶段可通过 `ctx.trigger` 读取 */
export type TriggerEvent =
  | {
      readonly kind: 'seat_eliminated';
      readonly seat: number;
      /** 机器可读的出局原因，如 exile、poison */
      readonly cause: string;
      readonly reason: string;
    }
  | { readonly kind: 'action_declared'; readonly seat: number; readonly action: string };

export type TriggerEventKind = TriggerEvent['kind'];

/** 阶段完成后的结构化结果，保存在 `ctx.results[phaseId]`（同一阶段多次访问时保留最近一次） */
export type PhaseResult =
  | { readonly kind: 'speak'; readonly speeches: readonly { readonly seat: number; readonly text: string }[] }
  | { readonly kind: 'act'; readonly decisions: readonly ActDecision[] }
  | {
      readonly kind: 'vote';
      readonly outcome: VoteOutcome;
      readonly rounds: number;
      /** 最终仍并列的座位（包括被种子打破的并列）；没有并列时为空 */
      readonly tied: readonly number[];
      /** 最后一轮（含复投）的有效选票，不含弃票 */
      readonly ballots: readonly VoteBallot[];
    }
  | {
      readonly kind: 'judge';
      readonly verdict: string;
      readonly counts: Readonly<Record<string, number>>;
      readonly judgements: readonly Judgement[];
    };

export type PhaseResultKind = PhaseResult['kind'];

/** 顶层只读（运行时还会深度冻结）；对 unknown 保持 unknown，便于引擎内部按擦除类型处理 */
export type ReadonlyValue<T> = T extends object ? Readonly<T> : T;

export interface VariantContext {
  readonly key: string;
  readonly name: string;
  readonly config: Readonly<Record<string, unknown>>;
}

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
  /** 由触发器进入的阶段链中，触发它的事件；否则为 null */
  readonly trigger: TriggerEvent | null;
  /** 本局的玩法变体；游戏没有定义变体时为 null */
  readonly variant: VariantContext | null;
  /** 种子随机数：由主种子、当前阶段、访问次数与标签派生 */
  random(label: string): Rng;
}

export interface SetupContext<P> {
  readonly params: ReadonlyValue<P>;
  readonly variant: VariantContext | null;
  readonly seats: SeatQuery;
  random(label: string): Rng;
}

/** 按局决定角色分配时的上下文（见 SetupSpec.deal） */
export interface DealContext<P> {
  readonly params: ReadonlyValue<P>;
  readonly variant: VariantContext | null;
  readonly playerCount: number;
  /** 变体（或 setup）声明的默认分配 */
  readonly assign: Readonly<Record<string, number | 'rest'>>;
  /** 由主种子与标签派生，与 SetupContext.random 互不相关 */
  random(label: string): Rng;
}
