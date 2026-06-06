import { createRuntime, ensureRound, syncRuntimeState } from '../runtime';
import { createWerewolfEvent, publishGameEvent, completed, isDone, markStepComplete } from './common';
import type { StepState } from './common';
import { buildWerewolfRuleIntro, phaseStartedMessage } from '../messages';
import { getSeatNumber } from '../utils';

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
      const message = phaseStartedMessage('night', step.config.day);

      // EventBus: 发布 phase-start 到客户端
      publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
        builder.setStep(step.id).setPhase('night').setDay(step.config.day || 1);
        return builder.buildPhaseStart('night', message);
      });

      return {
        status: 'COMPLETED',
        state: markStepComplete({ ...nextState, currentStep: step.id }, step.id) as StepState,
        events: [createWerewolfEvent(match, step, nextState as unknown as Record<string, unknown>, 'werewolf_phase_changed', message)]
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
      const message = phaseStartedMessage('day', step.config.day);

      // 规则 4：天亮绑票判定

      // EventBus: 发布 day-start 到客户端
      publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
        builder.setStep(step.id).setPhase('day').setDay(step.config.day || 1);
        return builder.build('day-start', { day: step.config.day, message });
      });

      // Day 2+：无警长竞选，天亮即报死亡结果
      if (step.config.day !== 1) {
        const nightDeaths = (round as { night?: { deaths?: Array<{ id: number; reason: string }> } }).night?.deaths || [];
        const deathMessage = nightDeaths.length
          ? `昨晚${nightDeaths.map((d) => `${getSeatNumber(d.id, runtime.agents)}号玩家`).join('、')}死亡`
          : '昨晚是平安夜';
        publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
          builder.setStep(step.id).setPhase('day').setDay(step.config.day || 1);
          return builder.buildNightResult(nightDeaths, deathMessage);
        });
      }

      return {
        status: 'COMPLETED',
        state: markStepComplete({ ...nextState, currentStep: step.id }, step.id) as StepState,
        events: [createWerewolfEvent(match, step, nextState as unknown as Record<string, unknown>, 'werewolf_phase_changed', message)]
      };
    }
  };
}

function createInstantHandler(eventType: string, message: string, options: { audienceCue?: boolean } = {}) {
  return {
    execute({ match, step, state }: { match: Match; step: Step; state: StepState }): HandlerResult {
      if (isDone(state, step.id)) return completed(state, step.id);
      const nextState = markStepComplete({ ...state, currentStep: step.id }, step.id);
      if (options.audienceCue) {
        const runtime = createRuntime(match, nextState);
        // 优先用 state 中的 modeConfig（首次 tick 可能为空），回退到 B 端配置
        const modeCfg = runtime.modeConfig
          || (() => { try { const { getWerewolfModeConfig } = require('../../werewolf-config/service'); return getWerewolfModeConfig((match.config as Record<string, unknown> | undefined)?.werewolfMode || 'standard'); } catch { return null; } })();
        if (modeCfg) {
          const text = buildWerewolfRuleIntro(modeCfg as Record<string, unknown>);
          publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
            builder.setStep(step.id).setPhase('night').setDay(1);
            return builder.build('phase-changed', { text }, 'public', undefined, {
              audienceCue: { kind: 'rule-intro', display: 'modal', speech: 'browser', textField: 'text', once: true }
            });
          }, syncRuntimeState(runtime) as unknown as Record<string, unknown>);
        }
      }
      return { status: 'COMPLETED', state: nextState, events: [createWerewolfEvent(match, step, nextState as unknown as Record<string, unknown>, eventType, message)] };
    }
  };
}

export {
  createNightStartHandler,
  createDayStartHandler,
  createInstantHandler
};
