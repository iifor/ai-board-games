import type { ChannelType, ViewerContext as BaseViewerContext } from './channelTypes';

type ActorId = string | number;
type GameEngineChannel = ChannelType;

type WorkflowEffectStatus = 'proposed' | 'applied' | 'cancelled' | 'failed';

interface EngineError {
  code: string;
  message: string;
  details?: unknown;
}

interface EngineResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: EngineError;
}

interface DomainAction {
  id: string;
  matchId: string;
  windowId: string;
  actorId: ActorId;
  actionType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  traceId?: string;
  causationId?: string;
  correlationId?: string;
  submittedAt?: string;
}

interface WorkflowEffect {
  id: string;
  matchId: string;
  effectType: string;
  status: WorkflowEffectStatus;
  payload: Record<string, unknown>;
  priority?: number;
  stepId?: string;
  sourceActionId?: string;
  sourceEventSeq?: number;
  appliedEventSeq?: number;
  traceId?: string;
  causationId?: string;
  correlationId?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface DomainEvent {
  id: string;
  matchId: string;
  type: string;
  payload: Record<string, unknown>;
  channel: GameEngineChannel;
  scopeKey?: string;
  seq?: number;
  stepId?: string;
  actorId?: ActorId;
  traceId?: string;
  causationId?: string;
  correlationId?: string;
  idempotencyKey?: string;
  createdAt?: string;
}

interface ActionWindowSnapshot {
  id: string;
  matchId: string;
  stepId: string;
  actionType: string;
  status: string;
  actorIds: ActorId[];
  targetIds?: ActorId[];
  orderMode?: string;
  completionPolicy?: string;
  payload?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

interface MatchSnapshot {
  id: string;
  gameType: string;
  workflowId: string;
  status: string;
  currentStepIndex: number;
  version: number;
  config: Record<string, unknown>;
  state: Record<string, unknown>;
}

type ViewerContext = BaseViewerContext;

interface ChannelPolicy {
  canAccess?: (event: DomainEvent, viewer: ViewerContext) => boolean;
  matchScope?: (scopeKey: string, viewer: ViewerContext, event: DomainEvent) => boolean;
}

interface EffectResolverContext {
  match: MatchSnapshot | null;
  state: Record<string, unknown>;
  effect: WorkflowEffect;
}

interface EffectResolver {
  effectType: string;
  resolve: (context: EffectResolverContext) => DomainEvent[] | Promise<DomainEvent[]>;
}

interface CreateEffectsContext {
  match: MatchSnapshot | null;
  state: Record<string, unknown>;
  actionWindow?: ActionWindowSnapshot | null;
}

type CreateEffectsFromAction = (
  action: DomainAction,
  context: CreateEffectsContext
) => WorkflowEffect[] | Promise<WorkflowEffect[]>;

interface StateProjectionContext {
  match: MatchSnapshot | null;
  event: DomainEvent;
}

type ProjectStateFromEvent = (
  state: Record<string, unknown>,
  event: DomainEvent,
  context: StateProjectionContext
) => Record<string, unknown>;

interface SkillDefinition {
  id: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  timeoutMs?: number;
  retryPolicy?: Record<string, unknown>;
  fallbackPolicy?: Record<string, unknown>;
  visibility?: GameEngineChannel;
}

interface GameRuntimeRunContext {
  onEvent?: (event: Record<string, unknown>) => void;
}

interface GameRuntime {
  createMatch(input: { matchId?: string; config?: Record<string, unknown>; initialState?: Record<string, unknown> }): { id: string; [key: string]: unknown };
  run(matchId: string, context?: GameRuntimeRunContext): Promise<Record<string, unknown>>;
}

interface GameDefinition {
  gameType: string;
  version: string;
  workflowId: string;
  skills?: SkillDefinition[];
  actionSchemas?: Record<string, unknown>;
  createEffectsFromAction?: CreateEffectsFromAction;
  effectResolvers?: EffectResolver[];
  projectState?: ProjectStateFromEvent;
  channelPolicy?: ChannelPolicy;
  runtime?: GameRuntime;
  metadata?: Record<string, unknown>;
}

interface InvariantIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  subjectType?: 'match' | 'action-window' | 'effect' | 'event' | 'definition';
  subjectId?: string;
  details?: unknown;
}

interface EngineDefinitionSummary {
  gameType: string;
  version: string;
  workflowId: string;
  metadata?: Record<string, unknown>;
}

interface EngineStoreDebugState {
  match: MatchSnapshot | null;
  actionWindows: ActionWindowSnapshot[];
  effects: WorkflowEffect[];
  events: DomainEvent[];
  generatedAt: string;
}

interface EngineDebugState extends EngineStoreDebugState {
  definitions: EngineDefinitionSummary[];
  invariants: InvariantIssue[];
}

export type {
  ActorId,
  GameEngineChannel,
  WorkflowEffectStatus,
  EngineError,
  EngineResult,
  DomainAction,
  WorkflowEffect,
  DomainEvent,
  ActionWindowSnapshot,
  MatchSnapshot,
  ViewerContext,
  ChannelPolicy,
  EffectResolverContext,
  EffectResolver,
  CreateEffectsContext,
  CreateEffectsFromAction,
  StateProjectionContext,
  ProjectStateFromEvent,
  SkillDefinition,
  GameRuntimeRunContext,
  GameRuntime,
  GameDefinition,
  InvariantIssue,
  EngineDefinitionSummary,
  EngineStoreDebugState,
  EngineDebugState,
};
