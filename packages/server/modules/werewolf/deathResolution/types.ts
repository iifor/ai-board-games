import type { Runtime } from '../runtime';
import type { StepState } from '../handlers/common';

interface Match {
  id: string;
  [key: string]: unknown;
}

interface Step {
  id: string;
  config: {
    day?: number;
    phase?: string;
    actionType?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface DeathResolutionCheckpoint {
  stepId: string;
  source: 'night' | 'exile';
  initialEffectsApplied: boolean;
  initialEffects: Array<Record<string, unknown>>;
  initialDeathIds: number[];
  resultPublished: boolean;
  shadowAudited: boolean;
  completedHunterIds: number[];
  completedSheriffIds: number[];
  completedLastWordsIds: number[];
  finalized: boolean;
}

interface DeathResolutionRound extends Record<string, unknown> {
  day?: number;
  phase?: string;
  nightRevealed?: boolean;
  exile?: { id: number; reason?: string } | null;
  idiotReveal?: { id: number; reason?: string } | null;
  deathResolution?: DeathResolutionCheckpoint;
}

interface DeathResolutionContext {
  match: Match;
  step: Step;
  state: StepState;
  runtime: Runtime;
  round: DeathResolutionRound;
  checkpoint: DeathResolutionCheckpoint;
  events: unknown[];
}

interface HandlerResult {
  status: string;
  state: StepState;
  events?: unknown[];
  blockers?: unknown[];
  tasks?: unknown[];
  pendingActions?: unknown[];
}

type StageResult =
  | { kind: 'idle' }
  | { kind: 'advanced'; events?: unknown[] }
  | { kind: 'waiting'; result: HandlerResult };

function ensureDeathResolutionCheckpoint(
  round: DeathResolutionRound,
  step: Step,
  source: DeathResolutionCheckpoint['source'],
): DeathResolutionCheckpoint {
  if (round.deathResolution?.stepId === step.id && round.deathResolution.source === source) {
    return round.deathResolution;
  }
  const legacyApplied = source === 'night'
    ? Boolean(round.nightRevealed)
    : Boolean(round.exile || round.idiotReveal);
  const legacyDeathIds = source === 'night'
    ? (((round.night as { deaths?: Array<{ id: number }> } | undefined)?.deaths || []).map((death) => Number(death.id)))
    : (round.exile?.id ? [Number(round.exile.id)] : []);
  round.deathResolution = {
    stepId: step.id,
    source,
    initialEffectsApplied: legacyApplied,
    initialEffects: [],
    initialDeathIds: legacyDeathIds,
    resultPublished: source === 'exile' && Boolean(round.exile),
    shadowAudited: source === 'night' && legacyApplied,
    completedHunterIds: [],
    completedSheriffIds: [],
    completedLastWordsIds: [],
    finalized: false,
  };
  return round.deathResolution;
}

function appendUnique(values: number[], value: number): void {
  if (!values.some((item) => Number(item) === Number(value))) values.push(Number(value));
}

export {
  ensureDeathResolutionCheckpoint,
  appendUnique,
};

export type {
  Match,
  Step,
  HandlerResult,
  StageResult,
  DeathResolutionCheckpoint,
  DeathResolutionContext,
  DeathResolutionRound,
};
