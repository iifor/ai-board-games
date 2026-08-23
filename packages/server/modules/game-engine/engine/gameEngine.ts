import type {
  DomainAction,
  EngineDebugState,
  EngineDefinitionSummary,
  EngineResult,
  GameDefinition,
  GameRuntimeInput,
  GameRuntimeRunContext,
  WorkflowEffect,
} from '@ai-presenter/shared/types/gameEngine';
import { ActionWindowManager } from '../action-window/actionWindowManager';
import { ChannelSystem } from '../channel/channelSystem';
import { EffectQueue } from '../effect/effectQueue';
import { EffectResolutionService, EffectResolverRegistry } from '../effect/effectResolver';
import { PostgresMatchStateStore } from '../state/postgresMatchStateStore';
import type { MatchStateStore } from '../state/matchStateStore';
import { WorkflowRuntime } from '../workflow/workflowRuntime';
import type { RunUntilBlockedOptions } from '../workflow/workflowRuntime';
import { assertCanTick, collectEngineInvariants } from './invariantChecker';
import { GameDefinitionRegistry } from './gameDefinitionRegistry';

interface GameEngineOptions {
  store?: MatchStateStore;
  workflowRuntime?: WorkflowRuntime;
  actionWindowManager?: ActionWindowManager;
  effectQueue?: EffectQueue;
  channelSystem?: ChannelSystem;
}

interface CreateMatchInput {
  gameType: string;
  version?: string;
  config?: Record<string, unknown>;
  initialState?: Record<string, unknown>;
  matchId?: string;
}

class GameEngine {
  private definitions = new GameDefinitionRegistry();
  private store: MatchStateStore;
  private workflowRuntime: WorkflowRuntime;
  private actionWindowManager: ActionWindowManager;
  private effectQueue: EffectQueue;
  private channelSystem: ChannelSystem;

  constructor(options: GameEngineOptions = {}) {
    this.store = options.store || new PostgresMatchStateStore();
    this.workflowRuntime = options.workflowRuntime || new WorkflowRuntime();
    this.actionWindowManager = options.actionWindowManager || new ActionWindowManager(this.store);
    this.effectQueue = options.effectQueue || new EffectQueue(this.store);
    this.channelSystem = options.channelSystem || new ChannelSystem();
  }

  registerDefinition(definition: GameDefinition): this {
    this.definitions.register(definition);
    return this;
  }

  getDefinition(gameType: string, version?: string): GameDefinition | null {
    return this.definitions.get(gameType, version);
  }

  listDefinitions(): GameDefinition[] {
    return this.definitions.list();
  }

  createMatch(input: CreateMatchInput) {
    const definition = this.requireDefinition(input.gameType, input.version);
    return this.workflowRuntime.createMatch({
      workflowId: definition.workflowId,
      gameType: definition.gameType,
      config: {
        ...(input.config || {}),
        gameDefinitionVersion: definition.version,
      },
      initialState: input.initialState,
      matchId: input.matchId,
    });
  }

  async tick(matchId: string) {
    assertCanTick(await this.store.loadMatch(matchId));
    return this.workflowRuntime.tick(matchId);
  }

  runUntilBlocked(matchId: string, options: RunUntilBlockedOptions = {}) {
    return this.workflowRuntime.runUntilBlocked(matchId, options);
  }

  /**
   * 使用 definition 的自定义 runtime 创建并运行游戏。
   * 如果 definition 没有 runtime，抛出错误。
   */
  async runGame(
    gameType: string,
    input: GameRuntimeInput,
    context?: GameRuntimeRunContext,
  ): Promise<Record<string, unknown>> {
    const definition = this.requireDefinition(gameType);
    if (!definition.runtime) {
      throw new Error(`GameDefinition "${gameType}" does not have a runtime. Use createMatch() + tick() instead.`);
    }
    if (definition.runtime.execute) {
      return definition.runtime.execute(input, context);
    }
    if (!definition.runtime.createMatch || !definition.runtime.run) {
      throw new Error(`GameDefinition "${gameType}" runtime requires execute() or createMatch() + run().`);
    }
    const match = await definition.runtime.createMatch(input);
    return definition.runtime.run(match.id, context);
  }

  async submitAction(action: DomainAction): Promise<EngineResult<{ action: DomainAction; effects: WorkflowEffect[] }>> {
    const shapeError = validateDomainAction(action);
    if (shapeError) return failure(shapeError.code, shapeError.message);

    const actionResult = await this.actionWindowManager.submitAction(action);
    if (!actionResult.ok) {
      return failure(
        actionResult.error?.code || 'ACTION_REJECTED',
        actionResult.error?.message || 'DomainAction was rejected.',
        actionResult.error?.details,
      );
    }

    const match = await this.store.loadMatch(action.matchId);
    const definition = this.requireDefinitionForMatch(match?.gameType || '', match?.config?.gameDefinitionVersion as string | undefined);
    const payloadValidation = validateActionPayload(definition.actionSchemas?.[action.actionType], action.payload);
    if (!payloadValidation.ok) return failure(payloadValidation.error!.code, payloadValidation.error!.message, payloadValidation.error!.details);

    const normalizedAction: DomainAction = {
      ...action,
      payload: payloadValidation.data || action.payload,
    };
    const actionWindow = await this.store.getActionWindow(action.matchId, action.windowId);
    const effects = definition.createEffectsFromAction
      ? await definition.createEffectsFromAction(normalizedAction, {
          match,
          state: match?.state || {},
          actionWindow,
        })
      : [];
    const storedEffects = await this.effectQueue.enqueueMany(effects);
    return { ok: true, data: { action: normalizedAction, effects: storedEffects } };
  }

  async resolveEffects(matchId: string): Promise<EngineResult<{ events: unknown[] }>> {
    const match = await this.store.loadMatch(matchId);
    if (!match) return failure('MATCH_NOT_FOUND', `Match not found: ${matchId}`);
    const definition = this.requireDefinitionForMatch(match.gameType, match.config?.gameDefinitionVersion as string | undefined);
    const resolverRegistry = new EffectResolverRegistry(definition.effectResolvers || []);
    const service = new EffectResolutionService(this.store, resolverRegistry, this.channelSystem, {
      projectState: definition.projectState,
    });
    const events = await service.resolvePending(matchId, match.state);
    return { ok: true, data: { events } };
  }

  async getDebugState(matchId: string): Promise<EngineDebugState> {
    const storeState = await this.store.getDebugState(matchId);
    return {
      ...storeState,
      definitions: this.listDefinitions().map(toDefinitionSummary),
      invariants: collectEngineInvariants(storeState),
      generatedAt: new Date().toISOString(),
    };
  }

  private requireDefinition(gameType: string, version?: string): GameDefinition {
    const definition = this.definitions.get(gameType, version);
    if (!definition) throw new Error(`GameDefinition not registered: ${gameType}${version ? `@${version}` : ''}`);
    return definition;
  }

  private requireDefinitionForMatch(gameType: string, version?: string): GameDefinition {
    return this.requireDefinition(gameType, version);
  }
}

function validateDomainAction(action: DomainAction): { code: string; message: string } | null {
  if (!action?.id || !action.matchId || !action.windowId || !action.actionType || !action.idempotencyKey) {
    return { code: 'ACTION_SHAPE_INVALID', message: 'DomainAction requires id, matchId, windowId, actionType, and idempotencyKey.' };
  }
  if (action.actorId === undefined || action.actorId === null || action.actorId === '') {
    return { code: 'ACTION_ACTOR_REQUIRED', message: 'DomainAction requires actorId.' };
  }
  if (!action.payload || typeof action.payload !== 'object' || Array.isArray(action.payload)) {
    return { code: 'ACTION_PAYLOAD_INVALID', message: 'DomainAction payload must be an object.' };
  }
  return null;
}

function validateActionPayload(schema: unknown, payload: Record<string, unknown>): EngineResult<Record<string, unknown>> {
  if (!schema) return { ok: true, data: payload };
  const maybeSafeParser = schema as { safeParse?: (value: unknown) => { success: boolean; data?: unknown; error?: unknown } };
  if (typeof maybeSafeParser.safeParse === 'function') {
    const result = maybeSafeParser.safeParse(payload);
    if (!result.success) {
      return failure('ACTION_SCHEMA_INVALID', 'DomainAction payload failed schema validation.', result.error);
    }
    return { ok: true, data: toRecord(result.data) };
  }
  const maybeParser = schema as { parse?: (value: unknown) => unknown };
  if (typeof maybeParser.parse === 'function') {
    try {
      return { ok: true, data: toRecord(maybeParser.parse(payload)) };
    } catch (error) {
      return failure('ACTION_SCHEMA_INVALID', 'DomainAction payload failed schema validation.', error);
    }
  }
  return { ok: true, data: payload };
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function failure<T = never>(code: string, message: string, details?: unknown): EngineResult<T> {
  return { ok: false, error: { code, message, details } };
}

function toDefinitionSummary(definition: GameDefinition): EngineDefinitionSummary {
  return {
    gameType: definition.gameType,
    version: definition.version,
    workflowId: definition.workflowId,
    metadata: definition.metadata,
  };
}

export { GameEngine };
export type { CreateMatchInput, GameEngineOptions };
