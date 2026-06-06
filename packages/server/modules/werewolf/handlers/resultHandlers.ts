import { MATCH_STATUS } from '@ai-presenter/shared/types/workflowTypes';
import { checkDayWin, getAliveRosterStats } from '../winCheck';
import type { WerewolfAgent } from '../winCheck';
import { createRuntime, ensureRound, syncRuntimeState } from '../runtime';
import { resolveActiveSheriffId } from '../sheriffWorkflow';
import { createWerewolfEvent, completed, isDone, markStepComplete } from './common';
import type { StepState } from './common';

interface Match {
  id: string;
  [key: string]: unknown;
}

interface Step {
  id: string;
  config: {
    day?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface HandlerResult {
  status: string;
  state: StepState;
  events?: unknown[];
  matchStatus?: string;
}

function createCheckWinHandler() {
  return {
    execute({ match, step, state }: { match: Match; step: Step; state: StepState }): HandlerResult {
      if (isDone(state, step.id)) return completed(state, step.id);
      if (state.winner) return { status: 'COMPLETED', state: markStepComplete({ ...state, currentStep: step.id }, step.id) };
      const runtime = createRuntime(match, state);
      const day = step.config.day || 1;
      const round = ensureRound(runtime.state, day);
      const result = checkDayWin(
        runtime.agents,
        day,
        runtime.modeConfig,
        resolveActiveSheriffId(runtime as never, round as never),
      );
      const nextState = markStepComplete({
        ...syncRuntimeState(runtime),
        currentStep: step.id,
        winner: result.winner,
        winReason: result.winReason || ''
      }, step.id);
      return {
        status: 'COMPLETED',
        matchStatus: result.winner ? MATCH_STATUS.COMPLETED : undefined,
        state: nextState,
        events: [createWerewolfEvent(match, step, nextState as unknown as Record<string, unknown>, result.winner ? 'werewolf_game_completed' : 'werewolf_phase_changed', result.winner ? 'winner decided' : 'game continues')]
      };
    }
  };
}

function createFinalizeHandler() {
  return {
    execute({ match, step, state }: { match: Match; step: Step; state: StepState }): HandlerResult {
      if (isDone(state, step.id)) return completed(state, step.id);
      const roster = getAliveRosterStats((state.players || []) as WerewolfAgent[]);
      const nextState = markStepComplete({
        ...state,
        currentStep: step.id,
        winner: state.winner || (roster.wolves ? 'wolves' : 'good'),
        winReason: state.winReason || 'max days reached'
      }, step.id);
      return {
        status: 'COMPLETED',
        matchStatus: MATCH_STATUS.COMPLETED,
        state: nextState,
        events: [createWerewolfEvent(match, step, nextState as unknown as Record<string, unknown>, 'werewolf_game_completed', 'game completed')]
      };
    }
  };
}

export {
  createCheckWinHandler,
  createFinalizeHandler
};
