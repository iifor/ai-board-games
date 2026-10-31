import type { StageLayout } from '@battle/shared';
import type { ZodType } from 'zod';
import type { PromptTemplate } from '../prompt/template';
import type { BreakpointSetting, Seat, TemplateVars } from '../runtime/types';
import type { RuleContext, SetupContext } from './context';
import type { PhaseSpec, SpeechOutput } from './phases';

export interface RoleSpec {
  /** 展示名，如"正方" */
  readonly name: string;
  readonly team: string;
  readonly identity: PromptTemplate;
  /** 该角色的席位数，按座位顺序编号 1..n（如一辩到四辩） */
  readonly positions?: number;
  /** 所有人（包括观众）都知道谁是该角色 */
  readonly publicRole?: boolean;
  /** 该角色能看到同阵营队友的身份 */
  readonly knowsTeammates?: boolean;
}

/** 状态字段对 AI 的可见性；未声明的字段一律视为 host（任何 AI 都看不到） */
export type Visibility =
  | 'public'
  | 'host'
  /** 值是按座位号索引的对象，每个座位只能看到自己的那一项 */
  | 'ownerOnly'
  | { readonly team: string }
  | { project(value: unknown, viewer: Seat): unknown };

export interface StateSpec<S> {
  readonly schema: ZodType<S>;
  readonly visibility?: { readonly [K in keyof S]?: Visibility };
}

export interface SetupSpec<S, P> {
  /** 角色 → 数量；最多一个角色取 'rest' 承接剩余人数 */
  readonly assign: Readonly<Record<string, number | 'rest'>>;
  /** 是否用种子打乱身份分配，默认 true */
  readonly shuffle?: boolean;
  /** 返回值不参与类型推断：S 只由 state.schema 决定 */
  init(ctx: SetupContext<P>): NoInfer<S>;
}

export interface EndResult {
  readonly winner: string | null;
  readonly winnerLabel: string;
  readonly summary: string;
  readonly mvp?: number | null;
}

export interface PresentationSpec<S, P> {
  readonly layout: StageLayout;
  readonly audienceView?: 'public' | 'omniscient';
  /** 布局区域 → 阵营，如 versus 的 left/right/bench */
  readonly areas?: Readonly<Record<string, string>>;
  readonly revealOnEnd?: readonly 'roles'[];
  /** 观众视图的附加数据（如辩题）；作者负责只放公开信息 */
  view?(ctx: RuleContext<S, P>, status: 'running' | 'completed'): Readonly<Record<string, unknown>>;
}

export interface BudgetSpec {
  readonly maxRounds?: number;
  readonly maxPhaseVisits?: number;
  readonly maxAiRequests?: number;
}

export interface DebugSpec<S, P> {
  readonly breakpoints?: BreakpointSetting;
  /** 调试局的发言内容；不提供时使用通用调试文案 */
  speak?(ctx: RuleContext<S, P>, seat: Seat, vars: TemplateVars): SpeechOutput;
}

export type PromptSet = Readonly<Record<string, PromptTemplate>>;

export interface GameSpec<S, P> {
  readonly key: string;
  readonly version: number;
  readonly title: string;
  readonly description: string;
  readonly players: { readonly min: number; readonly max: number };
  readonly params?: ZodType<P>;
  /** 本游戏用到的全部模板；规则、身份、阶段模板都必须来自这里 */
  readonly prompts: PromptSet;
  readonly rulesText: PromptTemplate;
  readonly roles: Readonly<Record<string, RoleSpec>>;
  /** 座位在日志与提示词中的称呼，默认 "3号 张三" */
  seatLabel?(seat: Seat): string;
  readonly setup: SetupSpec<S, P>;
  readonly state: StateSpec<S>;
  readonly start: string;
  readonly phases: Readonly<Record<string, PhaseSpec<S, P>>>;
  end(ctx: RuleContext<S, P>): EndResult;
  readonly budget?: BudgetSpec;
  readonly presentation: PresentationSpec<S, P>;
  readonly debug?: DebugSpec<S, P>;
}

/** 引擎内部按擦除后的类型处理 spec；类型安全由 defineGame 在编写处保证 */
export type AnyGameSpec = GameSpec<unknown, unknown>;
