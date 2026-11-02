import type { ZodType } from 'zod';
import type { PromptTemplate } from '../prompt/template';
import type { ExecEnv } from '../runtime/env';
import type { AiAction, PendingRequest, TemplateVars } from '../runtime/types';
import type { PhaseResult } from '../spec/context';
import type { PhaseSpec } from '../spec/phases';

/** 执行器希望发出的 AI 请求；由 ai/requests 负责渲染 prompt、登记 pending */
export interface RequestDraft {
  readonly slot: string;
  readonly seat: number;
  readonly action: AiAction;
  readonly template: PromptTemplate;
  readonly vars: TemplateVars;
  readonly legalTargets: readonly number[] | null;
}

export type StepOutcome =
  | { readonly kind: 'issue'; readonly drafts: readonly RequestDraft[] }
  | { readonly kind: 'done'; readonly result: PhaseResult | null };

export interface PhaseExecutor<Ph extends PhaseSpec<unknown, unknown>> {
  /** 进入阶段：计算参与者等并初始化 phaseState */
  enter(env: ExecEnv, phase: Ph): void;
  /** 在没有待处理请求时调用：要么发出新请求，要么完成阶段 */
  step(env: ExecEnv, phase: Ph): StepOutcome;
}

/** 需要 AI 输出的阶段：引擎统一完成解析、校验、重试与兜底，执行器只提供各自的规则 */
export interface AiPhaseExecutor<Ph extends PhaseSpec<unknown, unknown>> extends PhaseExecutor<Ph> {
  schema(env: ExecEnv, phase: Ph, pending: PendingRequest): ZodType;
  /** 已通过 schema 的值是否合法；返回错误原因或 null */
  check(env: ExecEnv, phase: Ph, pending: PendingRequest, value: unknown): string | null;
  fallback(env: ExecEnv, phase: Ph, pending: PendingRequest): unknown;
  store(env: ExecEnv, phase: Ph, pending: PendingRequest, value: unknown): void;
}

export function done(result: PhaseResult | null = null): StepOutcome {
  return { kind: 'done', result };
}

export function issue(drafts: readonly RequestDraft[]): StepOutcome {
  if (drafts.length === 0) throw new Error('issue 至少需要一个请求');
  return { kind: 'issue', drafts };
}

export function templateByName(env: ExecEnv, name: string): PromptTemplate {
  const template = env.game.prompts.get(name);
  if (!template) throw new Error(`模板 "${name}" 未登记在 spec.prompts 中`);
  return template;
}

/** 引擎注入的轮次变量：发言与点评的目标字数，模板以 {{turn.maxChars}} 引用 */
export const MAX_CHARS_VAR = 'maxChars';

/** 把引擎按输出 schema 决定的字数并入轮次变量；游戏在 SpeakTurn.vars 中自行设置同名变量视为写错（会与 schema 脱节） */
export function withMaxChars(vars: TemplateVars, maxChars: number): TemplateVars {
  if (MAX_CHARS_VAR in vars) throw new Error(`轮次变量 ${MAX_CHARS_VAR} 由引擎按输出 schema 注入，不能在 vars 中自行设置`);
  return { ...vars, [MAX_CHARS_VAR]: maxChars };
}
