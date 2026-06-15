import { checkDayWin, getAliveRosterStats } from '../winCheck';
import type { WerewolfAgent } from '../winCheck';
import { createRuntime, ensureRound, syncRuntimeState } from '../runtime';
import { resolveActiveSheriffId } from '../sheriffWorkflow';
import { createWerewolfEvent, completed, isDone, markStepComplete } from './common';
import type { StepState } from './common';
import { WEREWOLF_POSTGAME_DAYBREAK_STEP_ID } from '../postgame';

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
  nextStepId?: string;
}

function createCheckWinHandler() {
  return {
    execute({ match, step, state }: { match: Match; step: Step; state: StepState }): HandlerResult {
      if (isDone(state, step.id)) return completed(state, step.id);
      if (state.winner) {
        return {
          status: 'COMPLETED',
          state: markStepComplete({ ...state, currentStep: step.id }, step.id),
          nextStepId: WEREWOLF_POSTGAME_DAYBREAK_STEP_ID,
        };
      }
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
        state: nextState,
        events: [createWerewolfEvent(
          match,
          step,
          nextState as unknown as Record<string, unknown>,
          result.winner ? 'werewolf_game_result' : 'werewolf_phase_changed',
          result.winner ? result.winReason : 'game continues',
          result.winner ? { winner: result.winner } : {},
        )],
        ...(result.winner ? { nextStepId: WEREWOLF_POSTGAME_DAYBREAK_STEP_ID } : {}),
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
        state: nextState,
        nextStepId: WEREWOLF_POSTGAME_DAYBREAK_STEP_ID,
        events: [createWerewolfEvent(
          match,
          step,
          nextState as unknown as Record<string, unknown>,
          'werewolf_game_result',
          nextState.winReason as string,
          { winner: nextState.winner },
        )],
      };
    }
  };
}

export {
  createCheckWinHandler,
  createFinalizeHandler
};
