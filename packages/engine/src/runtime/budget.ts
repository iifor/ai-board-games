import type { CompiledGame } from '../compiler/compile';

export interface BudgetLimits {
  readonly maxRounds: number | null;
  readonly maxPhaseVisits: number;
  readonly maxAiRequests: number;
}

export const DEFAULT_MAX_PHASE_VISITS = 100;
export const DEFAULT_MAX_AI_REQUESTS = 1000;

export function budgetLimits(game: CompiledGame): BudgetLimits {
  const budget = game.spec.budget ?? {};
  return {
    maxRounds: budget.maxRounds ?? null,
    maxPhaseVisits: budget.maxPhaseVisits ?? DEFAULT_MAX_PHASE_VISITS,
    maxAiRequests: budget.maxAiRequests ?? DEFAULT_MAX_AI_REQUESTS,
  };
}
