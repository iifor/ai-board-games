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
  /** 顺序发言中，允许其他有权座位在发言窗口私下选择是否声明。 */
  readonly listenerPrompt?: PromptTemplate;
  allowed(ctx: RuleContext<S, P>, seat: Seat): boolean;
  describe?(ctx: RuleContext<S, P>, seat: Seat): string;
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
  /** 串行发言中可点名同频道参与者确认分工；首轮结束后每人最多补一次。 */
  readonly followUp?: { readonly prompt: PromptTemplate; readonly fallbackText: string };
  /** 允许以 { speech: null } 主动跳过该回合，不写发言事件。 */
  readonly allowSkip?: boolean;
  readonly output: ZodType<SpeechOutput>;
  /** 返回错误原因表示内容不合格，null 表示通过 */
  validate?(output: SpeechOutput, ctx: RuleContext<S, P>, seat: Seat): string | null;
  fallback(ctx: RuleContext<S, P>, seat: Seat): SpeechOutput;
  channel?(ctx: RuleContext<S, P>, seat: Seat): Channel;
  /** 声明 key → 规则；output 必须是 z.object，引擎会为有权声明的座位追加可选的 declare 字段 */
  readonly declarations?: Readonly<Record<string, DeclarationSpec<S, P>>>;
}

/**
 * 关键操作的"心里话"：输出契约追加可选的 aside 字段，由模型自己判断要不要说（平常省略，觉得此刻有博弈才说）。
 * 写入观战频道的发言（purpose: 'aside'），观众可见、可朗读，不进入任何 AI 的可见历史（包括说话者本人）。
 */
export interface AsideSpec {
  /** 字数上限，默认 60 */
  readonly maxChars?: number;
}

export interface ActPhase<S, P> extends AiPhaseBase<S, P> {
  readonly kind: 'act';
  /** 动作名，用于日志与提示，如"查验" */
  readonly action: string;
  actors(ctx: RuleContext<S, P>): SeatSelection;
  targets(ctx: RuleContext<S, P>, seat: Seat): SeatSelection;
  /** 仅在该座位确实有合法选择时私下播报一次，重试不重复。 */
  decisionNotice?(legalTargets: readonly number[], ctx: RuleContext<S, P>): string;
  /** 每人选择的目标数，默认 1 */
  readonly count?: number;
  /** 允许放弃（输出空数组），如女巫不用药 */
  readonly allowNone?: boolean;
  /** @deprecated 请求失败统一跳过行动。 */
  readonly fallbackMode?: 'random' | 'none';
  /** 默认写入该座位的私密频道 */
  channel?(ctx: RuleContext<S, P>, seat: Seat): Channel;
  describe?(ctx: RuleContext<S, P>, seat: Seat, targets: readonly number[]): string;
  apply?(ctx: RuleContext<S, P>, decisions: readonly ActDecision[]): NoInfer<S>;
  /** 允许行动者附带一句给观众的心里话 */
  readonly aside?: AsideSpec;
}

/** 不属于任何投票者的额外票（如乌鸦的诅咒）：计入每一轮计票，只对该轮的候选人有效 */
export interface VoteBonus {
  readonly target: number;
  /** 正数 */
  readonly votes: number;
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
  /** 额外票：进入阶段时计算一次，计入计票结果（日志 tally 中包含额外票，ballots 中不包含） */
  bonus?(ctx: RuleContext<S, P>): readonly VoteBonus[];
  /** 允许弃票（输出 target: null） */
  readonly allowAbstain?: boolean;
  /** @deprecated 请求失败统一弃票。 */
  readonly fallbackMode?: 'random' | 'abstain';
  apply?(ctx: RuleContext<S, P>, outcome: VoteOutcome): NoInfer<S>;
  /** 计票结果的公开范围，默认 public */
  readonly channel?: Channel;
  /** 允许投票者附带一句给观众的心里话 */
  readonly aside?: AsideSpec;
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
  /** @deprecated 请求失败时评委弃权。 */
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
