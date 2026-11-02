import type { PhaseSpec, TriggerSpec } from '@battle/engine';
import type { WerewolfParams, WerewolfState } from '../state';

export type WerewolfPhases = Readonly<Record<string, PhaseSpec<WerewolfState, WerewolfParams>>>;

export type WerewolfTriggers = readonly TriggerSpec<WerewolfState, WerewolfParams>[];
