import type { Channel, GameResult, StageEvent, StageEventMeta, StagePayload } from '@battle/shared';
import type { PhaseResult, TriggerEvent } from '../spec/context';

export interface SeatProfile {
  readonly playerId: string;
  readonly name: string;
  readonly persona: string;
  readonly avatar: string | null;
}

export interface Seat {
  /** 座位号，从 1 开始 */
  readonly seat: number;
  readonly profile: SeatProfile;
  readonly role: string;
  readonly team: string;
  /** 角色内席位编号（如一辩到四辩），没有席位的角色为 null */
  readonly position: number | null;
  readonly alive: boolean;
  /** 中途改变阵营时记录：只能看到新阵营频道中序号不小于此值的日志（开局即在阵营中则没有此字段） */
  readonly teamSince?: number;
}

export type LogEntry = StagePayload & StageEventMeta;
export type LogDraft = StagePayload & { readonly channel?: Channel };

export type EngineStatus = 'created' | 'running' | 'waiting_ai' | 'paused' | 'completed';
export type AiAction = 'speak' | 'act' | 'vote' | 'judge';
export type TemplateVars = Readonly<Record<string, string | number>>;

/** 已发出、等待结果的 AI 请求（快照内的精简形态） */
export interface PendingRequest {
  readonly id: string;
  readonly seat: number;
  readonly phaseId: string;
  readonly visit: number;
  /** 阶段内的槽位，如发言轮次 t3、投票 r0:5 */
  readonly slot: string;
  readonly action: AiAction;
  /** 从 1 开始 */
  readonly attempt: number;
  readonly legalTargets: readonly number[] | null;
  readonly vars: TemplateVars;
  readonly templateName: string;
  readonly previousError: string | null;
}

export interface Cursor {
  phaseId: string | null;
  entered: boolean;
  visit: number;
  phaseState: unknown;
}

export type BreakpointSetting = 'all' | readonly string[];

export interface DebugState {
  breakpoints: BreakpointSetting;
  mode: 'breakpoints' | 'step' | 'run';
  /** 允许不暂停地进入一次的阶段（`phaseId#visit`） */
  passKey: string | null;
}

export interface ResumeTarget {
  readonly goto: string;
  readonly round: boolean;
}

export interface StackFrame {
  /** 插入的阶段链结束后要去的地方 */
  readonly resume: ResumeTarget;
  /** 进入插入链之前生效的触发事件，return 时恢复 */
  readonly trigger: TriggerEvent | null;
}

export interface QueuedTrigger {
  readonly phaseId: string;
  readonly event: TriggerEvent;
}

export interface PendingJump {
  readonly phaseId: string;
  readonly round: boolean;
  readonly event: TriggerEvent;
}

export interface EngineSnapshot {
  readonly engineVersion: 1;
  readonly gameKey: string;
  readonly specVersion: number;
  readonly specHash: string;
  readonly variantKey: string | null;
  readonly seed: number;
  readonly params: unknown;
  status: EngineStatus;
  seats: readonly Seat[];
  state: unknown;
  round: number;
  cursor: Cursor;
  visits: Record<string, number>;
  results: Record<string, PhaseResult>;
  stack: StackFrame[];
  /** 已触发、等待当前阶段结束后插入的阶段 */
  triggerQueue: QueuedTrigger[];
  activeTrigger: TriggerEvent | null;
  jump: PendingJump | null;
  gameOverTriggered: boolean;
  rolesRevealed: boolean;
  log: LogEntry[];
  pending: PendingRequest[];
  budgetUsed: { aiRequests: number };
  result: GameResult | null;
  debug: DebugState | null;
}

export interface PromptLayers {
  /** L1 平台契约 */
  readonly platform: string;
  /** L2 游戏规则 */
  readonly rules: string;
  /** L3 身份与人设 */
  readonly identity: string;
  /** L4 可见历史 */
  readonly history: string;
  /** L5 阶段指令 */
  readonly instruction: string;
  /** L6 输出契约 */
  readonly output: string;
}

export type JsonSchema = Readonly<Record<string, unknown>>;

/** 交给服务端执行的 AI 请求：prompt 已渲染完成，服务端只负责调用模型并回传原始输出 */
export interface AiRequest {
  readonly id: string;
  readonly seat: number;
  readonly phaseId: string;
  readonly action: AiAction;
  readonly attempt: number;
  readonly prompt: PromptLayers;
  readonly outputSchema: JsonSchema;
  readonly legalTargets: readonly number[] | null;
}

export type DebugCommand = 'continue' | 'step' | 'run' | 'skip';

export type EngineInput =
  | { readonly kind: 'start' }
  | { readonly kind: 'ai_result'; readonly requestId: string; readonly output: unknown }
  /** 传输层已重试仍失败（超时、限流、模型报错），引擎直接走兜底 */
  | { readonly kind: 'ai_failed'; readonly requestId: string; readonly reason: string }
  | { readonly kind: 'debug'; readonly command: DebugCommand };

export interface AdvanceResult {
  readonly snapshot: EngineSnapshot;
  readonly log: readonly LogEntry[];
  readonly stageEvents: readonly StageEvent[];
  readonly aiRequests: readonly AiRequest[];
  readonly status: EngineStatus;
}

export interface CreateMatchInput {
  readonly seed: number;
  readonly players: readonly SeatProfile[];
  readonly params?: unknown;
  /** 玩法变体 key；游戏定义了变体而未指定时使用 defaultVariant */
  readonly variant?: string;
  /** 传入即为调试局：可暂停、单步、跳过 */
  readonly debug?: { readonly breakpoints?: BreakpointSetting };
}
