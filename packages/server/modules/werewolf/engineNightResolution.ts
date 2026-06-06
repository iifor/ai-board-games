import type {
  DomainEvent,
  EffectResolver,
  WorkflowEffect,
} from '@ai-presenter/shared/types/gameEngine';
import { WEREWOLF_EFFECT_TYPES } from '@ai-presenter/shared/types/workflowTypes';

interface NightResolutionInput {
  wolfTarget: number | null;
  guardTarget: number | null;
  witchSave: boolean;
  witchSaveTarget: number | null;
  witchPoisonTarget: number | null;
}

interface NightDeath {
  id: number;
  reason: string;
}

interface NightResolutionResult {
  day: number;
  input: NightResolutionInput;
  effects: Array<{ type: string; target?: number; reason?: string }>;
  deaths: NightDeath[];
  message: string;
}

function createNightResolutionResolver(): EffectResolver {
  return {
    effectType: 'night_resolution',
    resolve({ effect, state }): DomainEvent[] {
      const day = resolveDay(effect, state);
      const resolution = resolveEngineNightResolution(state, day);
      return [
        {
          id: `${effect.id}:night_resolved`,
          matchId: effect.matchId,
          type: 'night_resolved',
          channel: 'public',
          causationId: effect.id,
          correlationId: effect.correlationId || effect.sourceActionId,
          idempotencyKey: `${effect.id}:night_resolved`,
          payload: {
            day: resolution.day,
            deaths: resolution.deaths,
            message: resolution.message,
          },
        },
        {
          id: `${effect.id}:night_resolution_audited`,
          matchId: effect.matchId,
          type: 'night_resolution_audited',
          channel: 'system',
          causationId: effect.id,
          correlationId: effect.correlationId || effect.sourceActionId,
          idempotencyKey: `${effect.id}:night_resolution_audited`,
          payload: {
            day: resolution.day,
            input: resolution.input,
            effects: resolution.effects,
            deaths: resolution.deaths,
            message: resolution.message,
          },
        },
      ];
    },
  };
}

function resolveEngineNightResolution(state: Record<string, unknown>, day: number): NightResolutionResult {
  const night = getNight(state, day);
  const input: NightResolutionInput = {
    wolfTarget: toPositiveNumber(night.wolfTarget),
    guardTarget: toPositiveNumber(night.guardTarget),
    witchSave: night.witchSave === true,
    witchSaveTarget: toPositiveNumber(night.witchSaveTarget),
    witchPoisonTarget: toPositiveNumber(night.witchPoisonTarget),
  };
  const effects: NightResolutionResult['effects'] = [];
  if (input.wolfTarget) effects.push({ type: WEREWOLF_EFFECT_TYPES.KILL, target: input.wolfTarget, reason: '狼人袭击' });
  if (input.guardTarget) effects.push({ type: WEREWOLF_EFFECT_TYPES.PROTECT, target: input.guardTarget });
  if (input.witchSave && input.witchSaveTarget) effects.push({ type: WEREWOLF_EFFECT_TYPES.SAVE, target: input.witchSaveTarget });
  const validPoisonTarget = input.witchSave ? null : input.witchPoisonTarget;
  if (validPoisonTarget) effects.push({ type: WEREWOLF_EFFECT_TYPES.POISON, target: validPoisonTarget, reason: '女巫毒杀' });

  const savedTarget = input.witchSave ? input.witchSaveTarget : null;
  const deaths: NightDeath[] = [];
  if (
    input.wolfTarget &&
    Number(input.wolfTarget) !== Number(input.guardTarget) &&
    Number(input.wolfTarget) !== Number(savedTarget)
  ) {
    deaths.push({ id: input.wolfTarget, reason: '狼人袭击' });
  }
  if (validPoisonTarget && !deaths.some((death) => Number(death.id) === Number(validPoisonTarget))) {
    deaths.push({ id: validPoisonTarget, reason: '女巫毒杀' });
  }

  return {
    day,
    input,
    effects,
    deaths,
    message: buildNightResolutionMessage(day, deaths),
  };
}

function projectNightResolutionStateFromEvent(
  state: Record<string, unknown>,
  event: DomainEvent,
): Record<string, unknown> {
  if (event.type !== 'night_resolved') return state;
  const next = cloneRecord(state);
  const day = toPositiveNumber(event.payload.day) || 1;
  const round = ensureRound(next, day);
  const night = ensureNestedRecord(round, 'night');
  const deaths = normalizeDeaths(event.payload.deaths);
  night.deaths = deaths;
  round.nightRevealed = true;
  round.publicSummary = String(event.payload.message || buildNightResolutionMessage(day, deaths));
  applyDeathsToPlayers(next, day, deaths);
  return next;
}

function buildNightResolutionMessage(day: number, deaths: NightDeath[]): string {
  return deaths.length
    ? `Night ${day} deaths: ${deaths.map((death) => death.id).join(', ')}`
    : `Night ${day} ended with no deaths.`;
}

function resolveDay(effect: WorkflowEffect, state: Record<string, unknown>): number {
  const fromEffect = toPositiveNumber(effect.payload.day);
  if (fromEffect) return fromEffect;
  const rounds = Array.isArray(state.rounds) ? state.rounds as Record<string, unknown>[] : [];
  const latest = rounds.at(-1);
  return toPositiveNumber(latest?.day) || 1;
}

function getNight(state: Record<string, unknown>, day: number): Record<string, unknown> {
  const rounds = Array.isArray(state.rounds) ? state.rounds as Record<string, unknown>[] : [];
  const round = rounds.find((item) => Number(item.day) === day);
  return isRecord(round?.night) ? round.night as Record<string, unknown> : {};
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
  if (isRecord(value)) return value;
  const next: Record<string, unknown> = {};
  parent[key] = next;
  return next;
}

function applyDeathsToPlayers(state: Record<string, unknown>, day: number, deaths: NightDeath[]): void {
  if (!Array.isArray(state.players)) return;
  const players = state.players as Record<string, unknown>[];
  for (const death of deaths) {
    const player = players.find((item) => Number(item.id) === Number(death.id));
    if (!player || player.alive === false) continue;
    player.alive = false;
    player.deathDay = day;
    player.deathReason = death.reason;
  }
}

function normalizeDeaths(value: unknown): NightDeath[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => isRecord(item)
      ? { id: toPositiveNumber(item.id) || 0, reason: String(item.reason || '') }
      : { id: 0, reason: '' })
    .filter((item) => item.id > 0 && item.reason);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toPositiveNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value || {})) as Record<string, unknown>;
}

export {
  createNightResolutionResolver,
  projectNightResolutionStateFromEvent,
  resolveEngineNightResolution,
};

export type {
  NightResolutionInput,
  NightDeath,
  NightResolutionResult,
};
