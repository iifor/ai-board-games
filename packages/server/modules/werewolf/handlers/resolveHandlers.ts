import {
  buildActionWindow,
  createActionBlockers,
  hasOpenWork,
  collectActionResults,
  allActionWorkSucceeded,
  resolveActionWindow
} from '../actionWindows';
import type { ActionWindow } from '../actionWindows';
import { applyHunterShot, resolveExileEffects, resolveNightEffects } from '../effects';
import { createRuntime, ensureRound, syncRuntimeState } from '../runtime';
import type { Runtime } from '../runtime';
import { findPendingHunter } from '../reducers';
import type { Agent as ReducerAgent, Round as ReducerRound } from '../reducers';
import { isSheriffResolveReady, resolveSheriffElection, shouldRunSheriffElection } from '../sheriffWorkflow';
import { runHunterAiTask, validateHunterAiResult } from '../aiActions';
import { createWerewolfEvent, completed, isDone, markStepComplete } from './common';
import type { StepState } from './common';
import { recordWorkflowEffects } from '../../workflow-engine/effects';
import { actionRequestedMessage, actionResolvedMessage, effectResolvedMessage } from '../messages';
import { CHANNEL_TYPES } from '@ai-presenter/shared/types/channelTypes';
import { resolveActionChannel } from './actionChannel';

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

interface HandlerResult {
  status: string;
  state: StepState;
  events?: unknown[];
  blockers?: unknown[];
  tasks?: unknown[];
  pendingActions?: unknown[];
}

function createNightResolveHandler() {
  return {
    execute({ match, step, state }: { match: Match; step: Step; state: StepState }): HandlerResult {
      if (isDone(state, step.id) || state.winner) return completed(state, step.id);
      const runtime = createRuntime(match, state);
      const round = ensureRound(runtime.state, step.config.day!);
      const resolved = resolveNightEffects(runtime.agents as never, round as never);
      const hunter = findPendingHunter(runtime.agents as unknown as ReducerAgent[], round as unknown as ReducerRound, resolved.deaths);
      if (hunter) return createHunterWindow({ match, step, state, runtime, round, hunter });
      const nextState = markStepComplete({ ...syncRuntimeState(runtime), currentStep: step.id }, step.id);
      recordWorkflowEffects({ matchId: match.id, stepId: step.id, effects: resolved.effects as unknown as Record<string, unknown>[] });
      return {
        status: 'COMPLETED',
        state: nextState,
        events: [createWerewolfEvent(match, step, nextState as unknown as Record<string, unknown>, 'werewolf_effect_resolved', effectResolvedMessage('night', step.config.day), { effects: resolved.effects }, { channel: CHANNEL_TYPES.PUBLIC })]
      };
    },
    runAiTask: runHunterAiTask,
    validateAiResult: validateHunterAiResult
  };
}

function createExileResolveHandler() {
  return {
    execute({ match, step, state }: { match: Match; step: Step; state: StepState }): HandlerResult {
      if (isDone(state, step.id) || state.winner) return completed(state, step.id);
      const runtime = createRuntime(match, state);
      const round = ensureRound(runtime.state, step.config.day!);
      const resolved = resolveExileEffects(runtime.agents as never, round as never, runtime.modeConfig as never);
      const hunter = findPendingHunter(runtime.agents as unknown as ReducerAgent[], round as unknown as ReducerRound, resolved.exile ? [resolved.exile] : []);
      if (hunter) return createHunterWindow({ match, step, state, runtime, round, hunter });
      const nextState = markStepComplete({ ...syncRuntimeState(runtime), currentStep: step.id }, step.id);
      recordWorkflowEffects({ matchId: match.id, stepId: step.id, effects: resolved.effects as unknown as Record<string, unknown>[] });
      return {
        status: 'COMPLETED',
        state: nextState,
        events: [createWerewolfEvent(match, step, nextState as unknown as Record<string, unknown>, 'werewolf_effect_resolved', effectResolvedMessage('day', step.config.day), { effects: resolved.effects }, { channel: CHANNEL_TYPES.PUBLIC })]
      };
    },
    runAiTask: runHunterAiTask,
    validateAiResult: validateHunterAiResult
  };
}

function createHunterWindow({ match, step, state, runtime, round, hunter }: {
  match: Match;
  step: Step;
  state: StepState;
  runtime: Runtime;
  round: Record<string, unknown>;
  hunter: unknown;
}): HandlerResult {
  const actionType = 'hunter_shot';
  if (!hasOpenWork(match.id, step.id, actionType)) {
    const window = buildActionWindow({
      match,
      step: { ...step, config: { ...step.config, actionType } },
      state: state as unknown as Record<string, unknown>,
      actionType,
      actors: [hunter] as Parameters<typeof buildActionWindow>[0]['actors'],
      targetIds: (runtime.agents || []).filter((agent) => agent.alive).map((agent) => agent.id),
      optional: false
    });
    const work = createActionBlockers({ match, step, window, actors: [hunter] as Parameters<typeof createActionBlockers>[0]['actors'], promptContext: { day: (round as { day?: number }).day, actionType, round } });
    return {
      status: 'WAITING',
      state: { ...state, currentStep: step.id, currentActionWindow: window },
      blockers: work.blockers,
      tasks: work.tasks,
      pendingActions: work.pendingActions,
      events: [createWerewolfEvent(match, step, state as unknown as Record<string, unknown>, 'werewolf_action_requested', actionRequestedMessage(actionType, (round as { day?: number }).day), { actionType, actionWindow: window }, { channel: CHANNEL_TYPES.PUBLIC })]
    };
  }
  if (!allActionWorkSucceeded(match.id, step.id, actionType, 1)) {
    const window = state.currentActionWindow || { id: `${match.id}:${step.id}:${actionType}` };
    const work = createActionBlockers({ match, step, window: window as Parameters<typeof createActionBlockers>[0]['window'], actors: [hunter] as Parameters<typeof createActionBlockers>[0]['actors'], promptContext: { day: (round as { day?: number }).day, actionType, round } });
    return { status: 'WAITING', state: { ...state, currentStep: step.id }, blockers: work.blockers };
  }
  const result = collectActionResults(match.id, step.id, actionType)[0];
  const effect = applyHunterShot(runtime.agents as never, round as never, { from: (hunter as { id: number }).id, target: Number(result?.payload?.target), reason: (round as { phase?: string }).phase });
  const nextState = markStepComplete({ ...syncRuntimeState(runtime), currentStep: step.id, currentActionWindow: null }, step.id);
  resolveActionWindow(match.id, step.id, actionType, state.currentActionWindow as unknown as ActionWindow);
  if (effect) recordWorkflowEffects({ matchId: match.id, stepId: step.id, effects: [effect as unknown as Record<string, unknown>] });
  return {
    status: 'COMPLETED',
    state: nextState,
    events: [createWerewolfEvent(match, step, nextState as unknown as Record<string, unknown>, 'werewolf_effect_resolved', actionResolvedMessage(actionType, (round as { day?: number }).day), { actionType, effects: effect ? [effect] : [] })]
  };
}

function createSheriffResolveHandler() {
  return {
    execute({ match, step, state }: { match: Match; step: Step; state: StepState }): HandlerResult {
      if (isDone(state, step.id) || state.winner) return completed(state, step.id);
      const runtime = createRuntime(match, state);
      const round = ensureRound(runtime.state, step.config.day!);
      if (shouldRunSheriffElection(runtime as never, round as never) && isSheriffResolveReady(round as never)) {
        resolveSheriffElection(runtime as never, round as never);
      }
      const nextState = markStepComplete({ ...syncRuntimeState(runtime), currentStep: step.id, currentActionWindow: null }, step.id);
      return {
        status: 'COMPLETED',
        state: nextState,
        events: [createWerewolfEvent(match, step, nextState as unknown as Record<string, unknown>, 'werewolf_effect_resolved', actionResolvedMessage('sheriff_resolve', step.config.day), { sheriffElection: round.sheriffElection, sheriffId: round.sheriffId }, { channel: CHANNEL_TYPES.PUBLIC })]
      };
    }
  };
}

export {
  createNightResolveHandler,
  createExileResolveHandler,
  createSheriffResolveHandler,
  createHunterWindow
};
