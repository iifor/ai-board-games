import type { NightDeath, NightResolutionResult } from './engineNightResolution';
import { resolveEngineNightResolution } from './engineNightResolution';

type ShadowAuditStatus = 'matched' | 'mismatched' | 'audit_failed';

interface LegacyNightResolutionResult {
  effects: Array<Record<string, unknown>>;
  deaths: Array<{ id: number; reason: string }>;
}

interface NightResolutionMismatch {
  field: 'deaths' | 'effects';
  legacy: unknown;
  engine: unknown;
}

interface NormalizedNightEffect {
  type: string;
  target?: number;
  reason?: string;
}

interface NightResolutionShadowAudit {
  day: number;
  status: ShadowAuditStatus;
  legacy: {
    effects: NormalizedNightEffect[];
    deaths: NightDeath[];
  };
  engine?: {
    effects: NormalizedNightEffect[];
    deaths: NightDeath[];
    input: NightResolutionResult['input'];
    message: string;
  };
  mismatches?: NightResolutionMismatch[];
  error?: {
    message: string;
  };
}

type NightResolutionResolver = (state: Record<string, unknown>, day: number) => NightResolutionResult;

function auditNightResolutionShadow(
  input: {
    stateBeforeLegacy: Record<string, unknown>;
    day: number;
    legacy: LegacyNightResolutionResult;
  },
  resolveNight: NightResolutionResolver = resolveEngineNightResolution,
): NightResolutionShadowAudit {
  const legacy = {
    effects: normalizeEffects(input.legacy.effects),
    deaths: normalizeDeaths(input.legacy.deaths),
  };
  try {
    const engineResolution = resolveNight(cloneRecord(input.stateBeforeLegacy), input.day);
    const engine = {
      effects: normalizeEffects(engineResolution.effects),
      deaths: normalizeDeaths(engineResolution.deaths),
      input: engineResolution.input,
      message: engineResolution.message,
    };
    const mismatches = collectMismatches(legacy, engine);
    return {
      day: input.day,
      status: mismatches.length ? 'mismatched' : 'matched',
      legacy,
      engine,
      ...(mismatches.length ? { mismatches } : {}),
    };
  } catch (error) {
    return {
      day: input.day,
      status: 'audit_failed',
      legacy,
      error: {
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function collectMismatches(
  legacy: NightResolutionShadowAudit['legacy'],
  engine: NonNullable<NightResolutionShadowAudit['engine']>,
): NightResolutionMismatch[] {
  const mismatches: NightResolutionMismatch[] = [];
  if (!sameJson(legacy.deaths, engine.deaths)) {
    mismatches.push({ field: 'deaths', legacy: legacy.deaths, engine: engine.deaths });
  }
  if (!sameJson(legacy.effects, engine.effects)) {
    mismatches.push({ field: 'effects', legacy: legacy.effects, engine: engine.effects });
  }
  return mismatches;
}

function normalizeDeaths(deaths: Array<{ id: number; reason: string }> = []): NightDeath[] {
  return deaths
    .map((death) => ({
      id: Number(death.id),
      reason: String(death.reason || ''),
    }))
    .filter((death) => Number.isFinite(death.id) && death.id > 0 && death.reason)
    .sort((left, right) => left.id - right.id || left.reason.localeCompare(right.reason));
}

function normalizeEffects(effects: Array<Record<string, unknown>> = []): NormalizedNightEffect[] {
  return effects
    .map((effect) => {
      const normalized: NormalizedNightEffect = {
        type: String(effect.type || effect.effectType || ''),
      };
      if (effect.target !== undefined && effect.target !== null) normalized.target = Number(effect.target);
      if (effect.reason !== undefined && effect.reason !== null) normalized.reason = String(effect.reason);
      return normalized;
    })
    .filter((effect): effect is NormalizedNightEffect => Boolean(effect.type))
    .sort((left, right) => compareEffect(left, right));
}

function compareEffect(left: NormalizedNightEffect, right: NormalizedNightEffect): number {
  return String(left.type).localeCompare(String(right.type))
    || Number(left.target || 0) - Number(right.target || 0)
    || String(left.reason || '').localeCompare(String(right.reason || ''));
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value || {})) as Record<string, unknown>;
}

export {
  auditNightResolutionShadow,
};

export type {
  LegacyNightResolutionResult,
  NightResolutionMismatch,
  NightResolutionShadowAudit,
  NormalizedNightEffect,
  ShadowAuditStatus,
};
