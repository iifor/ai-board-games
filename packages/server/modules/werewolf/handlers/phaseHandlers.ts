import { createRuntime, ensureRound, syncRuntimeState } from '../runtime';
import {
  completed,
  createWerewolfEvent,
  isDone,
  markStepComplete,
  publishGameEvent,
} from './common';
import type { StepState } from './common';
import { buildWerewolfRuleIntro, phaseStartedMessage } from '../messages';

interface Match {
  id: string;
  config?: Record<string, unknown>;
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
      const message = phaseStartedMessage('night', step.config.day);

      publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
        builder.setStep(step.id).setPhase('night').setDay(step.config.day || 1);
        return builder.buildPhaseStart('night', message);
      });

      return {
        status: 'COMPLETED',
        state: markStepComplete({ ...nextState, currentStep: step.id }, step.id) as StepState,
        events: [
          createWerewolfEvent(
            match,
            step,
            nextState as unknown as Record<string, unknown>,
            'werewolf_phase_changed',
            message,
          ),
        ],
      };
    },
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
      const message = phaseStartedMessage('day', step.config.day);

      publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
        builder.setStep(step.id).setPhase('day').setDay(step.config.day || 1);
        return builder.build('day-start', { day: step.config.day, message });
      });

      return {
        status: 'COMPLETED',
        state: markStepComplete({ ...nextState, currentStep: step.id }, step.id) as StepState,
        events: [
          createWerewolfEvent(
            match,
            step,
            nextState as unknown as Record<string, unknown>,
            'werewolf_phase_changed',
            message,
          ),
        ],
      };
    },
  };
}

function createInstantHandler(
  eventType: string,
  message: string,
  options: { audienceCue?: boolean } = {},
) {
  return {
    execute({ match, step, state }: { match: Match; step: Step; state: StepState }): HandlerResult {
      if (isDone(state, step.id)) return completed(state, step.id);
      const nextState = markStepComplete({ ...state, currentStep: step.id }, step.id);
      if (options.audienceCue) {
        const runtime = createRuntime(match, nextState);
        const modeConfig = runtime.modeConfig || loadModeConfig(match);
        if (modeConfig) {
          const text = buildWerewolfRuleIntro(modeConfig);
          publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
            builder.setStep(step.id).setPhase('night').setDay(1);
            return builder.build(
              'phase-changed',
              { text },
              'public',
              undefined,
              {
                audienceCue: {
                  kind: 'rule-intro',
                  display: 'modal',
                  speech: 'browser',
                  textField: 'text',
                  once: true,
                },
              },
            );
          }, syncRuntimeState(runtime) as unknown as Record<string, unknown>);
        }
      }
      return {
        status: 'COMPLETED',
        state: nextState,
        events: [
          createWerewolfEvent(
            match,
            step,
            nextState as unknown as Record<string, unknown>,
            eventType,
            message,
          ),
        ],
      };
    },
  };
}

function loadModeConfig(match: Match): Record<string, unknown> | null {
  try {
    const { getWerewolfModeConfig } = require('../../werewolf-config/service');
    return getWerewolfModeConfig(match.config?.werewolfMode || 'standard');
  } catch {
    return null;
  }
}

export {
  createNightStartHandler,
  createDayStartHandler,
  createInstantHandler,
};
