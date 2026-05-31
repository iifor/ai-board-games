import { z } from 'zod';
import type {
  ChannelPolicy,
  DomainAction,
  DomainEvent,
  GameDefinition,
  ViewerContext,
  WorkflowEffect,
} from '@ai-presenter/shared/types/gameEngine';
import { WEREWOLF_WORKFLOW_ID, registerWerewolfWorkflow } from './workflow';

const WEREWOLF_GAME_DEFINITION_VERSION = '1.0.0';

const targetPayloadSchema = z.object({
  target: z.union([z.number(), z.string().regex(/^\d+$/)]).transform(Number),
}).passthrough();

const werewolfChannelPolicy: ChannelPolicy = {
  matchScope(scopeKey: string, viewer: ViewerContext): boolean {
    if (scopeKey === 'wolves') return viewer.faction === 'wolves';
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
  registerWerewolfWorkflow();
  return {
    gameType: 'werewolf',
    version: WEREWOLF_GAME_DEFINITION_VERSION,
    workflowId: WEREWOLF_WORKFLOW_ID,
    actionSchemas: {
      seer_check: targetPayloadSchema,
      guard_protect: targetPayloadSchema,
    },
    createEffectsFromAction: createWerewolfEffectsFromAction,
    effectResolvers: [
      createInspectResolver(),
      createProtectResolver(),
    ],
    channelPolicy: werewolfChannelPolicy,
    metadata: {
      migratedActions: ['seer_check', 'guard_protect'],
    },
  };
}

function createWerewolfEffectsFromAction(action: DomainAction): WorkflowEffect[] {
  if (action.actionType === 'seer_check') return [createInspectEffect(action)];
  if (action.actionType === 'guard_protect') return [createProtectEffect(action)];
  return [];
}

function createInspectEffect(action: DomainAction): WorkflowEffect {
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
      target,
      result: action.payload.result || 'unknown',
    },
  };
}

function createProtectEffect(action: DomainAction): WorkflowEffect {
  const target = Number(action.payload.target);
  return {
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
      target,
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
          target: effect.payload.target,
          result: effect.payload.result || 'unknown',
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
          target: effect.payload.target,
        },
      }];
    },
  };
}

const WEREWOLF_GAME_DEFINITION = createWerewolfGameDefinition();

export {
  WEREWOLF_GAME_DEFINITION_VERSION,
  WEREWOLF_GAME_DEFINITION,
  werewolfChannelPolicy,
  createWerewolfGameDefinition,
  createWerewolfEffectsFromAction,
};
