import type { Channel, VoteOutcome } from '@battle/shared';
import type { ZodType } from 'zod';
import type { PromptTemplate } from '../prompt/template';
import type { SeatSelection } from '../runtime/seats';
import type { LogDraft, Seat, TemplateVars } from '../runtime/types';
import type { ActDecision, RuleContext } from './context';

/** 跳转目标：阶段 ID、`end`（终局）或 `return`（结束触发器插入的阶段链，回到原流程） */

// 约定：所有回调都用方法语法声明。方法参数是双变的，
// 这样 GameSpec<具体状态, 具体参数> 可以交给按 unknown 处理 spec 的引擎内部使用。

export interface Transition<S, P> {
  when?(ctx: RuleContext<S, P>): boolean;
  /** 阶段 ID、`end` 或 `return` */
  readonly goto: string;
  readonly round?: 'increment';
}

/** 阶段 ID，或按顺序判断的跳转列表（最后一项必须无条件） */
export type NextSpec<S, P> = string | readonly Transition<S, P>[];

interface PhaseBase<S, P> {
  readonly title?: string;
  readonly next: NextSpec<S, P>;
  /** 返回 false 时静默跳过本阶段（不记录、不计访问次数），直接按 next 跳转；用于本局不存在的角色 */
  enabled?(ctx: RuleContext<S, P>): boolean;
  /** 单局内最多进入次数，默认取 budget.maxPhaseVisits */
  readonly maxVisits?: number;
}

interface AiPhaseBase<S, P> extends PhaseBase<S, P> {
  readonly prompt: PromptTemplate;
  /** 输出不合法时带错误原因重问的次数，默认 1 */
  readonly retries?: number;
}

export interface SpeechOutput {
  readonly speech: string;
}

export interface SpeakTurn {
  readonly seat: Seat | number;
  /** 覆盖阶段默认模板，必须来自 spec.prompts */
  readonly prompt?: PromptTemplate;
  /** 模板中以 `turn.*` 访问 */
  readonly vars?: TemplateVars;
}

/** 发言时可附带声明的动作（如狼人自爆）；声明后引擎派发 action_declared 事件 */
export interface DeclarationSpec<S, P> {
  readonly label: string;
  allowed(ctx: RuleContext<S, P>, seat: Seat): boolean;
}

export interface AnnouncePhase<S, P> extends PhaseBase<S, P> {
  readonly kind: 'announce';
  /** 用公开上下文渲染，拿不到任何私密信息 */
  readonly text: PromptTemplate;
  readonly channel?: Channel;
}

export interface SpeakPhase<S, P> extends AiPhaseBase<S, P> {
  readonly kind: 'speak';
  actors(ctx: RuleContext<S, P>): SeatSelection | readonly SpeakTurn[];
  /** sequential：一次一人，后发言者能看到前面的发言；parallel：同时发出 */
  readonly mode?: 'sequential' | 'parallel';
  readonly output: ZodType<SpeechOutput>;
  /** 返回错误原因表示内容不合格，null 表示通过 */
  validate?(output: SpeechOutput, ctx: RuleContext<S, P>, seat: Seat): string | null;
  fallback(ctx: RuleContext<S, P>, seat: Seat): SpeechOutput;
  channel?(ctx: RuleContext<S, P>, seat: Seat): Channel;
  /** 声明 key → 规则；output 必须是 z.object，引擎会为有权声明的座位追加可选的 declare 字段 */
  readonly declarations?: Readonly<Record<string, DeclarationSpec<S, P>>>;
}

export interface ActPhase<S, P> extends AiPhaseBase<S, P> {
  readonly kind: 'act';
  /** 动作名，用于日志与提示，如"查验" */
  readonly action: string;
  actors(ctx: RuleContext<S, P>): SeatSelection;
  targets(ctx: RuleContext<S, P>, seat: Seat): SeatSelection;
  /** 每人选择的目标数，默认 1 */
  readonly count?: number;
  /** 允许放弃（输出空数组），如女巫不用药 */
  readonly allowNone?: boolean;
  /** 兜底方式：random 随机合法目标，none 放弃；默认 allowNone 时为 none，否则为 random */
  readonly fallbackMode?: 'random' | 'none';
  /** 默认写入该座位的私密频道 */
  channel?(ctx: RuleContext<S, P>, seat: Seat): Channel;
  describe?(ctx: RuleContext<S, P>, seat: Seat, targets: readonly number[]): string;
  apply?(ctx: RuleContext<S, P>, decisions: readonly ActDecision[]): NoInfer<S>;
}

export interface VotePhase<S, P> extends AiPhaseBase<S, P> {
  readonly kind: 'vote';
  voters(ctx: RuleContext<S, P>): SeatSelection;
  candidates(ctx: RuleContext<S, P>, voter: Seat): SeatSelection;
  /** 平票时在并列者中复投 runoff 次，仍平票则按 then 处理 */
  readonly tie: { readonly runoff: number; readonly then: 'seeded_random' | 'none' };
  readonly onResult?: 'eliminate';
  readonly eliminateReason?: string;
  /** 淘汰时派发给触发器的 cause，默认为阶段 ID */
  readonly eliminateCause?: string;
  /** 票权，默认 1（如警长 1.5） */
  weight?(ctx: RuleContext<S, P>, voter: Seat): number;
  /** 允许弃票（输出 target: null） */
  readonly allowAbstain?: boolean;
  /** 兜底方式：random 随机合法目标，abstain 弃票；默认 random */
  readonly fallbackMode?: 'random' | 'abstain';
  apply?(ctx: RuleContext<S, P>, outcome: VoteOutcome): NoInfer<S>;
  /** 计票结果的公开范围，默认 public */
  readonly channel?: Channel;
}

export interface JudgeFallback {
  readonly verdict: string;
  readonly comment: string;
}

export interface JudgePhase<S, P> extends AiPhaseBase<S, P> {
  readonly kind: 'judge';
  judges(ctx: RuleContext<S, P>): SeatSelection;
  /** 可选判定：key → 展示文案 */
  readonly verdicts: Readonly<Record<string, string>>;
  /** 无评委或票数并列时的判定 */
  readonly tieVerdict: { readonly key: string; readonly label: string };
  readonly commentMax?: number;
  readonly channel?: Channel;
  fallback?(ctx: RuleContext<S, P>, seat: Seat): JudgeFallback;
}

export interface SeatReassignment {
  readonly seat: number;
  /** 新角色；阵营默认取新角色的 team */
  readonly role?: string;
  /** 只改阵营（如混血儿跟随主人）；与 role 同时给出时以此为准 */
  readonly team?: string;
}

export interface ComputeOutcome<S> {
  readonly state?: NoInfer<S>;
  readonly log?: readonly LogDraft[];
  /** 改变座位的角色或阵营（如盗贼换牌、野孩子变狼） */
  readonly reassign?: readonly SeatReassignment[];
  readonly eliminate?: readonly { readonly seat: number; readonly reason: string; readonly cause?: string }[];
}

export interface ComputePhase<S, P> extends PhaseBase<S, P> {
  readonly kind: 'compute';
  run(ctx: RuleContext<S, P>): ComputeOutcome<S>;
}

export interface RevealContent {
  readonly text: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface RevealPhase<S, P> extends PhaseBase<S, P> {
  readonly kind: 'reveal';
  content(ctx: RuleContext<S, P>): RevealContent;
  readonly channel?: Channel;
  /** 向所有玩家与观众公开全部身份（如赛后复盘） */
  readonly revealRoles?: boolean;
}

export type PhaseSpec<S, P> =
  | AnnouncePhase<S, P>
  | SpeakPhase<S, P>
  | ActPhase<S, P>
  | VotePhase<S, P>
  | JudgePhase<S, P>
  | ComputePhase<S, P>
  | RevealPhase<S, P>;

export type PhaseKind = PhaseSpec<unknown, unknown>['kind'];
export type AiPhaseSpec<S, P> = SpeakPhase<S, P> | ActPhase<S, P> | VotePhase<S, P> | JudgePhase<S, P>;
