import type {
  DomainAction,
  DomainEvent,
  WorkflowEffect,
} from '@ai-presenter/shared/types/gameEngine';
import { applyActionResults } from './reducers';
import type { ActionResult as ReducerActionResult, Runtime as ReducerRuntime, Step as ReducerStep } from './reducers';
import { createRuntime, ensureRound, syncRuntimeState } from './runtime';
import { createWerewolfGameDefinition } from './definition';

interface ActionEngineBridgeInput {
  match: { id: string; workflowId?: string; config?: Record<string, unknown>; [key: string]: unknown };
  step: { id: string; config: { day?: number; phase?: string; actionType?: string; [key: string]: unknown }; [key: string]: unknown };
  state: Record<string, unknown>;
  actionWindow?: Record<string, unknown> | null;
  results: ReducerActionResult[];
}

interface ActionEngineBridgeResult {
  state: Record<string, unknown>;
  events: DomainEvent[];
  effects: WorkflowEffect[];
  audit: WerewolfActionEngineShadowAudit;
  usedFallback: boolean;
}

interface WerewolfActionEngineShadowAudit {
  day?: number;
  actionType?: string;
  status: 'matched' | 'mismatched' | 'audit_failed';
  legacy: Record<string, unknown>;
  engine?: Record<string, unknown>;
  mismatches?: Array<{ field: string; legacy: unknown; engine: unknown }>;
  error?: { message: string };
}

const ENGINE_ACTIONS = new Set([
  'wolf_vote',
  'wolf_kill',
  'seer_check',
  'guard_protect',
  'witch_save',
  'witch_poison',
]);

function canUseWerewolfActionEngineBridge(actionType?: string): boolean {
  return ENGINE_ACTIONS.has(actionType || '');
}

function runWerewolfActionEngineBridge(input: ActionEngineBridgeInput): ActionEngineBridgeResult {
  const actionType = input.step.config.actionType || '';
  const legacyState = runLegacyActionState(input);
  const legacySnapshot = snapshotNightActionState(legacyState, input.step.config.day);

  try {
    const engine = runEngineActionState(input);
    const engineSnapshot = snapshotNightActionState(engine.state, input.step.config.day);
    const mismatches = diffSnapshots(legacySnapshot, engineSnapshot);
    return {
      state: engine.state,
      events: engine.events,
      effects: engine.effects,
      usedFallback: false,
      audit: {
        day: input.step.config.day,
        actionType,
        status: mismatches.length ? 'mismatched' : 'matched',
        legacy: legacySnapshot,
        engine: engineSnapshot,
        mismatches: mismatches.length ? mismatches : undefined,
      },
    };
  } catch (error) {
    return {
      state: legacyState,
      events: [],
      effects: [],
      usedFallback: true,
      audit: {
        day: input.step.config.day,
        actionType,
        status: 'audit_failed',
        legacy: legacySnapshot,
        error: { message: (error as Error).message },
      },
    };
  }
}

function buildDomainAction(input: ActionEngineBridgeInput, result: ReducerActionResult): DomainAction {
  const actionType = input.step.config.actionType || '';
  const actorId = result.actorId;
  const actionId = `${input.match.id}:${input.step.id}:${actionType}:${actorId}`;
  return {
    id: actionId,
    matchId: input.match.id,
    windowId: String(input.actionWindow?.id || `${input.match.id}:${input.step.id}:${actionType}`),
    actorId,
    actionType,
    payload: {
      day: input.step.config.day,
      actorId,
      actionType,
      ...(result.payload || {}),
    },
    idempotencyKey: actionId,
    causationId: input.step.id,
    correlationId: input.step.id,
  };
}

function runEngineActionState(input: ActionEngineBridgeInput): { state: Record<string, unknown>; events: DomainEvent[]; effects: WorkflowEffect[] } {
  const definition = createWerewolfGameDefinition();
  const resolvers = new Map((definition.effectResolvers || []).map((resolver) => [resolver.effectType, resolver]));
  let state = clone(input.state);
  const events: DomainEvent[] = [];
  const effects: WorkflowEffect[] = [];

  for (const result of input.results) {
    const action = validateAndNormalizeAction(buildDomainAction(input, result), definition.actionSchemas?.[input.step.config.actionType || '']);
    const created = definition.createEffectsFromAction
      ? definition.createEffectsFromAction(action, {
          match: {
            id: input.match.id,
            gameType: 'werewolf',
            workflowId: String(input.match.workflowId || definition.workflowId),
            status: 'running',
            currentStepIndex: 0,
            version: 1,
            config: {
              ...(input.match.config || {}),
              gameDefinitionVersion: definition.version,
            },
            state,
          },
          state,
          actionWindow: input.actionWindow ? {
            id: String(input.actionWindow.id || action.windowId),
            matchId: input.match.id,
            stepId: input.step.id,
            actionType: action.actionType,
            status: 'open',
            actorIds: toArray(input.actionWindow.actorIds),
            targetIds: toArray(input.actionWindow.targetIds),
            payload: input.actionWindow,
          } : null,
        })
      : [];
    if (isPromiseLike(created)) throw new Error('Async createEffectsFromAction is not supported by sync werewolf handler.');
    for (const effect of created) {
      effects.push(effect);
      const resolver = resolvers.get(effect.effectType);
      if (!resolver) throw new Error(`EffectResolver not registered: ${effect.effectType}`);
      const resolved = resolver.resolve({ match: null, state, effect });
      if (isPromiseLike(resolved)) throw new Error(`Async resolver is not supported by sync werewolf handler: ${effect.effectType}`);
      for (const event of resolved) {
        events.push(event);
        state = definition.projectState ? definition.projectState(state, event, { match: null, event }) : state;
      }
    }
  }

  return { state, events, effects };
}

function validateAndNormalizeAction(action: DomainAction, schema: unknown): DomainAction {
  if (!schema) return action;
  const safeParser = schema as { safeParse?: (value: unknown) => { success: boolean; data?: unknown; error?: unknown } };
  if (typeof safeParser.safeParse === 'function') {
    const parsed = safeParser.safeParse(action.payload);
    if (!parsed.success) throw new Error(`DomainAction payload failed schema validation: ${action.actionType}`);
    return { ...action, payload: toRecord(parsed.data) };
  }
  const parser = schema as { parse?: (value: unknown) => unknown };
  if (typeof parser.parse === 'function') {
    return { ...action, payload: toRecord(parser.parse(action.payload)) };
  }
  return action;
}

function runLegacyActionState(input: ActionEngineBridgeInput): Record<string, unknown> {
  const runtime = createRuntime(input.match as never, clone(input.state));
  const round = ensureRound(runtime.state, input.step.config.day!);
  applyActionResults(runtime as unknown as ReducerRuntime, input.step as unknown as ReducerStep, input.results);
  void round;
  return syncRuntimeState(runtime) as unknown as Record<string, unknown>;
}

function snapshotNightActionState(state: Record<string, unknown>, day?: number): Record<string, unknown> {
  const round = findRound(state, day);
  const night = (round?.night || {}) as Record<string, unknown>;
  const players = Array.isArray(state.players) ? state.players as Array<Record<string, unknown>> : [];
  return {
    night: {
      wolfChoices: night.wolfChoices || {},
      wolfVoteTally: night.wolfVoteTally || {},
      wolfTarget: night.wolfTarget || null,
      wolfStrategy: night.wolfStrategy || '',
      seerCheck: night.seerCheck || null,
      guardTarget: night.guardTarget || null,
      witchSave: Boolean(night.witchSave),
      witchSaveTarget: night.witchSaveTarget || null,
      witchPoisonTarget: night.witchPoisonTarget || null,
    },
    players: players.map((player) => ({
      id: player.id,
      seerChecks: normalizeSeerChecks(player.seerChecks),
      lastGuardTarget: player.lastGuardTarget || null,
      usedAntidote: Boolean(player.usedAntidote),
      usedPoison: Boolean(player.usedPoison),
    })),
  };
}

function normalizeSeerChecks(value: unknown): Array<Record<string, unknown>> {
  return (Array.isArray(value) ? value : []).map((check) => {
    const record = check && typeof check === 'object' ? check as Record<string, unknown> : {};
    return {
      target: record.target ?? null,
      result: record.result ?? null,
    };
  });
}

function findRound(state: Record<string, unknown>, day?: number): Record<string, unknown> | null {
  const rounds = Array.isArray(state.rounds) ? state.rounds as Array<Record<string, unknown>> : [];
  return rounds.find((round) => Number(round.day) === Number(day)) || rounds[rounds.length - 1] || null;
}

function diffSnapshots(legacy: Record<string, unknown>, engine: Record<string, unknown>): Array<{ field: string; legacy: unknown; engine: unknown }> {
  const mismatches: Array<{ field: string; legacy: unknown; engine: unknown }> = [];
  compareObject('night', legacy.night as Record<string, unknown>, engine.night as Record<string, unknown>, mismatches);
  const legacyPlayers = new Map((legacy.players as Array<Record<string, unknown>> || []).map((player) => [String(player.id), player]));
  const enginePlayers = new Map((engine.players as Array<Record<string, unknown>> || []).map((player) => [String(player.id), player]));
  for (const id of new Set([...legacyPlayers.keys(), ...enginePlayers.keys()])) {
    compareObject(`players.${id}`, legacyPlayers.get(id) || {}, enginePlayers.get(id) || {}, mismatches);
  }
  return mismatches;
}

function compareObject(
  prefix: string,
  legacy: Record<string, unknown>,
  engine: Record<string, unknown>,
  mismatches: Array<{ field: string; legacy: unknown; engine: unknown }>,
): void {
  for (const key of new Set([...Object.keys(legacy || {}), ...Object.keys(engine || {})])) {
    const left = legacy?.[key];
    const right = engine?.[key];
    if (JSON.stringify(left ?? null) !== JSON.stringify(right ?? null)) {
      mismatches.push({ field: `${prefix}.${key}`, legacy: left ?? null, engine: right ?? null });
    }
  }
}

function toArray(value: unknown): Array<string | number> {
  return Array.isArray(value) ? value as Array<string | number> : [];
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return Boolean(value && typeof (value as { then?: unknown }).then === 'function');
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value || {})) as T;
}

export {
  buildDomainAction,
  canUseWerewolfActionEngineBridge,
  runWerewolfActionEngineBridge,
};

export type {
  ActionEngineBridgeInput,
  ActionEngineBridgeResult,
  WerewolfActionEngineShadowAudit,
};
