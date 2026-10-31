import type { PhaseSpec } from '@battle/engine';
import type { WerewolfParams, WerewolfState } from '../state';

export type WerewolfPhases = Readonly<Record<string, PhaseSpec<WerewolfState, WerewolfParams>>>;
