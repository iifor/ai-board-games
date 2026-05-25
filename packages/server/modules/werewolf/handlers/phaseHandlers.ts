import { createRuntime, ensureRound, syncRuntimeState } from '../runtime';
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
    phase?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface HandlerResult {
  status: string;
  state: StepState;
  events?: unknown[];
}

function createNightStartHandler() {
  return {
    execute({ match, step, state }: { match: Match; step: Step; state: StepState }): HandlerResult {
      if (isDone(state, step.id) || state.winner) return completed(state, step.id);
      const runtime = createRuntime(match, state);
      const round = ensureRound(runtime.state, step.config.day!);
      round.phase = 'night';
      const nextState = syncRuntimeState(runtime);
      return {
        status: 'COMPLETED',
        state: markStepComplete({ ...nextState, currentStep: step.id }, step.id) as StepState,
        events: [createWerewolfEvent(match, step, nextState as unknown as Record<string, unknown>, 'werewolf_phase_changed', `Night ${step.config.day} started`)]
      };
    }
  };
}

function createDayStartHandler() {
  return {
    execute({ match, step, state }: { match: Match; step: Step; state: StepState }): HandlerResult {
      if (isDone(state, step.id) || state.winner) return completed(state, step.id);
      const runtime = createRuntime(match, state);
      const round = ensureRound(runtime.state, step.config.day!);
      round.phase = 'day';
      const nextState = syncRuntimeState(runtime);
      return {
        status: 'COMPLETED',
        state: markStepComplete({ ...nextState, currentStep: step.id }, step.id) as StepState,
        events: [createWerewolfEvent(match, step, nextState as unknown as Record<string, unknown>, 'werewolf_phase_changed', `Day ${step.config.day} started`)]
      };
    }
  };
}

function createInstantHandler(eventType: string, message: string) {
  return {
    execute({ match, step, state }: { match: Match; step: Step; state: StepState }): HandlerResult {
      if (isDone(state, step.id)) return completed(state, step.id);
      const nextState = markStepComplete({ ...state, currentStep: step.id }, step.id);
      return { status: 'COMPLETED', state: nextState, events: [createWerewolfEvent(match, step, nextState as unknown as Record<string, unknown>, eventType, message)] };
    }
  };
}

export {
  createNightStartHandler,
  createDayStartHandler,
  createInstantHandler
};
