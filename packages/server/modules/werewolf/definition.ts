import { z } from 'zod';
import type {
  ChannelPolicy,
  CreateEffectsContext,
  DomainAction,
  DomainEvent,
  GameDefinition,
  StateProjectionContext,
  ViewerContext,
  WorkflowEffect,
} from '@ai-presenter/shared/types/gameEngine';
import { WEREWOLF_WORKFLOW_ID } from './workflow';
import { countTargets, topTarget } from './winCheck';
import { buildWolfStrategySummary, getTopCandidateIds } from './utils';
import { createNightResolutionResolver, projectNightResolutionStateFromEvent } from './engineNightResolution';

const WEREWOLF_GAME_DEFINITION_VERSION = '1.0.0';

const targetValueSchema = z.union([z.number(), z.string().regex(/^\d+$/)]).transform(Number);

const targetPayloadSchema = z.object({
  target: targetValueSchema,
}).passthrough();

const optionalTargetPayloadSchema = z.object({
  target: z.unknown().optional(),
}).passthrough();

const witchSavePayloadSchema = z.object({
  use: z.boolean().default(false),
}).passthrough();

const witchPoisonPayloadSchema = z.object({
  use: z.boolean().default(false),
  target: targetValueSchema.nullish(),
}).passthrough().superRefine((payload, ctx) => {
  if (payload.use && (payload.target === null || payload.target === undefined)) {
    ctx.addIssue({
      code: 'custom',
      path: ['target'],
      message: 'target is required when witch poison is used',
    });
  }
});

const werewolfChannelPolicy: ChannelPolicy = {
  matchScope(scopeKey: string, viewer: ViewerContext): boolean {
    if (scopeKey === 'wolves') return viewer.faction === 'wolves';
    if (scopeKey === 'ghost_bride') {
      return viewer.faction === 'third_party' || (viewer.roles || []).includes('ghost_bride');
    }
    if (scopeKey === 'seer' || scopeKey === 'guard' || scopeKey === 'witch') {
      return (viewer.roles || []).includes(scopeKey);
    }
    if (scopeKey.startsWith('player:')) {
      return Number(scopeKey.slice('player:'.length)) === Number(viewer.playerId);
    }
    return false;
  },
};

function createWerewolfGameDefinition(): GameDefinition {
  return {
    gameType: 'werewolf',
    version: WEREWOLF_GAME_DEFINITION_VERSION,
    workflowId: WEREWOLF_WORKFLOW_ID,
    actionSchemas: {
      wolf_vote: optionalTargetPayloadSchema,
      wolf_kill: optionalTargetPayloadSchema,
      seer_check: targetPayloadSchema,
      guard_protect: optionalTargetPayloadSchema,
      witch_save: witchSavePayloadSchema,
      witch_poison: witchPoisonPayloadSchema,
    },
    createEffectsFromAction: createWerewolfEffectsFromAction,
    effectResolvers: [
      createKillResolver(),
      createInspectResolver(),
      createProtectResolver(),
      createSaveResolver(),
      createPoisonResolver(),
      createNightResolutionResolver(),
    ],
    projectState: projectWerewolfStateFromEvent,
    channelPolicy: werewolfChannelPolicy,
    metadata: {
      migratedActions: ['wolf_vote', 'wolf_kill', 'seer_check', 'guard_protect', 'witch_save', 'witch_poison'],
      session: {
        startMessage: '游戏开始',
        doneMessage: '狼人杀结束，完整战报已生成。',
        playback: { prefetchCount: 2 },
      },
    },
  };
}

function createWerewolfEffectsFromAction(
  action: DomainAction,
  context: Partial<CreateEffectsContext> = {},
): WorkflowEffect[] {
  const day = resolveActionDay(action, context);
  if (action.actionType === 'wolf_vote' || action.actionType === 'wolf_kill') return createKillEffects(action, day);
  if (action.actionType === 'seer_check') return [createInspectEffect(action, day)];
  if (action.actionType === 'guard_protect') return createProtectEffects(action, day);
  if (action.actionType === 'witch_save') return createSaveEffects(action, day, context);
  if (action.actionType === 'witch_poison') return createPoisonEffects(action, day, context);
  return [];
}

function createKillEffects(action: DomainAction, day: number): WorkflowEffect[] {
  const target = toPositiveNumber(action.payload.target);
  if (!target) return [];
  return [createKillEffect(action, day, target)];
}

function createKillEffect(action: DomainAction, day: number, target: number): WorkflowEffect {
  return {
    id: `${action.id}:kill`,
    matchId: action.matchId,
    effectType: 'kill',
    status: 'proposed',
    priority: 60,
    sourceActionId: action.id,
    causationId: action.id,
    correlationId: action.correlationId || action.id,
    payload: {
      sourceActionId: action.id,
      actionType: action.actionType,
      actorId: action.actorId,
      day,
      target,
      reason: '狼人袭击',
    },
  };
}

function createInspectEffect(action: DomainAction, day: number): WorkflowEffect {
  const target = Number(action.payload.target);
  return {
    id: `${action.id}:inspect`,
    matchId: action.matchId,
    effectType: 'inspect',
    status: 'proposed',
    priority: 50,
    sourceActionId: action.id,
    causationId: action.id,
    correlationId: action.correlationId || action.id,
    payload: {
      sourceActionId: action.id,
      actionType: action.actionType,
      actorId: action.actorId,
      day,
      target,
      result: action.payload.result || 'unknown',
      decisionReason: normalizeDecisionReason(action.payload.reason),
    },
  };
}

function createProtectEffects(action: DomainAction, day: number): WorkflowEffect[] {
  const target = toPositiveNumber(action.payload.target);
  if (!target) return [];
  return [{
    id: `${action.id}:protect`,
    matchId: action.matchId,
    effectType: 'protect',
    status: 'proposed',
    priority: 40,
    sourceActionId: action.id,
    causationId: action.id,
    correlationId: action.correlationId || action.id,
    payload: {
      sourceActionId: action.id,
      actionType: action.actionType,
      actorId: action.actorId,
      day,
      target,
      decisionReason: normalizeDecisionReason(action.payload.reason),
    },
  }];
}

function createSaveEffects(
  action: DomainAction,
  day: number,
  context: Partial<CreateEffectsContext>,
): WorkflowEffect[] {
  if (getNightNumber(context.state || {}, day, 'witchPoisonTarget')) return [];
  if (action.payload.use !== true) return [];
  const target = getNightNumber(context.state || {}, day, 'wolfTarget');
  if (!target) return [];
  return [createSaveEffect(action, day, target)];
}

function createSaveEffect(action: DomainAction, day: number, target: number): WorkflowEffect {
  return {
    id: `${action.id}:save`,
    matchId: action.matchId,
    effectType: 'save',
    status: 'proposed',
    priority: 30,
    sourceActionId: action.id,
    causationId: action.id,
    correlationId: action.correlationId || action.id,
    payload: {
      sourceActionId: action.id,
      actionType: action.actionType,
      actorId: action.actorId,
      day,
      target,
      decisionReason: normalizeDecisionReason(action.payload.reason),
    },
  };
}

function createPoisonEffects(
  action: DomainAction,
  day: number,
  context: Partial<CreateEffectsContext>,
): WorkflowEffect[] {
  if (getNightBoolean(context.state || {}, day, 'witchSave')) return [];
  if (action.payload.use !== true) return [];
  const target = toPositiveNumber(action.payload.target);
  if (!target) return [];
  return [createPoisonEffect(action, day, target)];
}

function createPoisonEffect(action: DomainAction, day: number, target: number): WorkflowEffect {
  return {
    id: `${action.id}:poison`,
    matchId: action.matchId,
    effectType: 'poison',
    status: 'proposed',
    priority: 20,
    sourceActionId: action.id,
    causationId: action.id,
    correlationId: action.correlationId || action.id,
    payload: {
      sourceActionId: action.id,
      actionType: action.actionType,
      actorId: action.actorId,
      day,
      target,
      reason: '女巫毒杀',
      decisionReason: normalizeDecisionReason(action.payload.reason),
    },
  };
}

function createKillResolver() {
  return {
    effectType: 'kill',
    resolve({ effect }: { effect: WorkflowEffect }): DomainEvent[] {
      return [{
        id: `${effect.id}:wolf_target_selected`,
        matchId: effect.matchId,
        type: 'wolf_target_selected',
        channel: 'scope',
        scopeKey: 'wolves',
        causationId: effect.id,
        correlationId: effect.correlationId || effect.sourceActionId,
        idempotencyKey: `${effect.id}:wolf_target_selected`,
        payload: {
          actorId: effect.payload.actorId,
          day: effect.payload.day,
          target: effect.payload.target,
          reason: effect.payload.reason || '狼人袭击',
        },
      }];
    },
  };
}

function createInspectResolver() {
  return {
    effectType: 'inspect',
    resolve({ effect }: { effect: WorkflowEffect }): DomainEvent[] {
      return [{
        id: `${effect.id}:seer_checked`,
        matchId: effect.matchId,
        type: 'seer_checked',
        channel: 'scope',
        scopeKey: 'seer',
        causationId: effect.id,
        correlationId: effect.correlationId || effect.sourceActionId,
        idempotencyKey: `${effect.id}:seer_checked`,
        payload: {
          actorId: effect.payload.actorId,
          day: effect.payload.day,
          target: effect.payload.target,
          result: effect.payload.result || 'unknown',
          reason: effect.payload.decisionReason || null,
        },
      }];
    },
  };
}

function createProtectResolver() {
  return {
    effectType: 'protect',
    resolve({ effect }: { effect: WorkflowEffect }): DomainEvent[] {
      return [{
        id: `${effect.id}:guard_protected`,
        matchId: effect.matchId,
        type: 'guard_protected',
        channel: 'scope',
        scopeKey: 'guard',
        causationId: effect.id,
        correlationId: effect.correlationId || effect.sourceActionId,
        idempotencyKey: `${effect.id}:guard_protected`,
        payload: {
          actorId: effect.payload.actorId,
          day: effect.payload.day,
          target: effect.payload.target,
          reason: effect.payload.decisionReason || null,
        },
      }];
    },
  };
}

function createSaveResolver() {
  return {
    effectType: 'save',
    resolve({ effect }: { effect: WorkflowEffect }): DomainEvent[] {
      return [{
        id: `${effect.id}:witch_saved`,
        matchId: effect.matchId,
        type: 'witch_saved',
        channel: 'scope',
        scopeKey: 'witch',
        causationId: effect.id,
        correlationId: effect.correlationId || effect.sourceActionId,
        idempotencyKey: `${effect.id}:witch_saved`,
        payload: {
          actorId: effect.payload.actorId,
          day: effect.payload.day,
          target: effect.payload.target,
          reason: effect.payload.decisionReason || null,
        },
      }];
    },
  };
}

function createPoisonResolver() {
  return {
    effectType: 'poison',
    resolve({ effect }: { effect: WorkflowEffect }): DomainEvent[] {
      return [{
        id: `${effect.id}:witch_poisoned`,
        matchId: effect.matchId,
        type: 'witch_poisoned',
        channel: 'scope',
        scopeKey: 'witch',
        causationId: effect.id,
        correlationId: effect.correlationId || effect.sourceActionId,
        idempotencyKey: `${effect.id}:witch_poisoned`,
        payload: {
          actorId: effect.payload.actorId,
          day: effect.payload.day,
          target: effect.payload.target,
          reason: effect.payload.reason || '女巫毒杀',
          decisionReason: effect.payload.decisionReason || null,
        },
      }];
    },
  };
}

function projectWerewolfStateFromEvent(
  state: Record<string, unknown>,
  event: DomainEvent,
  _context: StateProjectionContext,
): Record<string, unknown> {
  if (
    event.type !== 'seer_checked' &&
    event.type !== 'guard_protected' &&
    event.type !== 'witch_saved' &&
    event.type !== 'witch_poisoned' &&
    event.type !== 'wolf_target_selected' &&
    event.type !== 'night_resolved'
  ) return state;
  if (event.type === 'night_resolved') return projectNightResolutionStateFromEvent(state, event);
  const next = cloneRecord(state);
  const day = Number(event.payload.day || 1);
  const round = ensureRound(next, day);
  const night = ensureNestedRecord(round, 'night');
  const actorId = Number(event.payload.actorId);
  const target = Number(event.payload.target);

  if (event.type === 'wolf_target_selected') {
    const choices = isRecord(night.wolfChoices) ? night.wolfChoices as Record<string, number> : {};
    const nextChoices = { ...choices, [actorId]: target };
    const tally = countTargets(nextChoices);
    const topIds = getTopCandidateIds(tally);
    const selectedTarget = topIds[0] || topTarget(nextChoices);
    night.wolfChoices = nextChoices;
    night.wolfVoteTally = tally;
    night.wolfTarget = selectedTarget;
    night.wolfStrategy = buildWolfStrategySummary(nextChoices, selectedTarget, getStatePlayers(next));
  }

  if (event.type === 'seer_checked') {
    const result = String(event.payload.result || 'unknown');
    const reason = normalizeDecisionReason(event.payload.reason);
    night.seerCheck = { target, result, ...(reason ? { reason } : {}) };
    upsertPlayerRecord(next, actorId, (player) => {
      const checks = Array.isArray(player.seerChecks) ? player.seerChecks as Record<string, unknown>[] : [];
      player.seerChecks = upsertByDay(checks, day, { day, target, result, ...(reason ? { reason } : {}) });
    });
  }

  if (event.type === 'guard_protected') {
    night.guardTarget = target;
    const reason = normalizeDecisionReason(event.payload.reason);
    if (reason) night.guardReason = reason;
    upsertPlayerRecord(next, actorId, (player) => {
      player.lastGuardTarget = target;
    });
  }

  if (event.type === 'witch_saved') {
    night.witchSave = true;
    night.witchSaveTarget = target;
    const reason = normalizeDecisionReason(event.payload.reason);
    if (reason) night.witchSaveReason = reason;
    upsertPlayerRecord(next, actorId, (player) => {
      player.usedAntidote = true;
    });
  }

  if (event.type === 'witch_poisoned') {
    night.witchPoisonTarget = target;
    const reason = normalizeDecisionReason(event.payload.decisionReason);
    if (reason) night.witchPoisonReason = reason;
    upsertPlayerRecord(next, actorId, (player) => {
      player.usedPoison = true;
    });
  }

  return next;
}

function normalizeDecisionReason(value: unknown): string | null {
  const reason = String(value || '').trim().slice(0, 80);
  return reason || null;
}

function getStatePlayers(state: Record<string, unknown>): Array<Record<string, unknown> & { id: number }> {
  if (!Array.isArray(state.players)) return [];
  return state.players
    .filter((player): player is Record<string, unknown> => Boolean(player) && typeof player === 'object' && !Array.isArray(player))
    .map((player) => ({ ...player, id: Number(player.id) }))
    .filter((player) => Number.isFinite(player.id));
}

function resolveActionDay(
  action: DomainAction,
  context: { actionWindow?: { payload?: Record<string, unknown> | null } | null },
): number {
  const fromAction = Number(action.payload.day);
  if (Number.isFinite(fromAction) && fromAction > 0) return fromAction;
  const fromWindowPayload = Number(context.actionWindow?.payload?.day);
  if (Number.isFinite(fromWindowPayload) && fromWindowPayload > 0) return fromWindowPayload;
  return 1;
}

function getNightNumber(state: Record<string, unknown>, day: number, key: string): number | null {
  const rounds = Array.isArray(state.rounds) ? state.rounds as Record<string, unknown>[] : [];
  const round = rounds.find((item) => Number(item.day) === day);
  const night = round?.night;
  if (!night || typeof night !== 'object' || Array.isArray(night)) return null;
  return toPositiveNumber((night as Record<string, unknown>)[key]);
}

function getNightBoolean(state: Record<string, unknown>, day: number, key: string): boolean {
  const rounds = Array.isArray(state.rounds) ? state.rounds as Record<string, unknown>[] : [];
  const round = rounds.find((item) => Number(item.day) === day);
  const night = round?.night;
  if (!night || typeof night !== 'object' || Array.isArray(night)) return false;
  return (night as Record<string, unknown>)[key] === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toPositiveNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function ensureRound(state: Record<string, unknown>, day: number): Record<string, unknown> {
  const rounds = Array.isArray(state.rounds) ? state.rounds as Record<string, unknown>[] : [];
  let round = rounds.find((item) => Number(item.day) === day);
  if (!round) {
    round = { day, phase: 'night', night: {}, speeches: [], votes: {}, voteTally: {}, lastWords: [] };
    state.rounds = [...rounds, round];
  }
  return round;
}

function ensureNestedRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key];
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  parent[key] = next;
  return next;
}

function upsertPlayerRecord(
  state: Record<string, unknown>,
  playerId: number,
  updater: (player: Record<string, unknown>) => void,
): void {
  if (!Array.isArray(state.players)) return;
  const players = state.players as Record<string, unknown>[];
  const player = players.find((item) => Number(item.id) === playerId);
  if (player) updater(player);
}

function upsertByDay(
  items: Record<string, unknown>[],
  day: number,
  value: Record<string, unknown>,
): Record<string, unknown>[] {
  const index = items.findIndex((item) => Number(item.day) === day);
  if (index < 0) return [...items, value];
  return items.map((item, itemIndex) => itemIndex === index ? { ...item, ...value } : item);
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value || {})) as Record<string, unknown>;
}

export {
  WEREWOLF_GAME_DEFINITION_VERSION,
  werewolfChannelPolicy,
  createWerewolfGameDefinition,
  createWerewolfEffectsFromAction,
  projectWerewolfStateFromEvent,
};
