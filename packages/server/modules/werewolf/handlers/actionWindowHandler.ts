import {
  buildActionWindow,
  createActionBlockers,
  hasOpenWork,
  collectActionResults,
  allActionWorkSucceeded,
  resolveActionWindow
} from '../actionWindows';
import type { ActionWindow } from '../actionWindows';
import { createRuntime, ensureRound, syncRuntimeState } from '../runtime';
import type { Runtime } from '../runtime';
import { applyActionResults, getActorsForStep, getTargetIds } from '../reducers';
import type { ActionResult as ReducerActionResult, Runtime as ReducerRuntime, Round as ReducerRound, Step as ReducerStep } from '../reducers';
import { shouldSkipSheriffAction } from '../sheriffWorkflow';
import { ensureWolfTeamContext } from '../wolfTeam';
import { runActionWindowAiTask, validateActionWindowAiResult } from '../aiActions';
import { createWerewolfEvent, completed, isDone, markStepComplete } from './common';
import type { StepState } from './common';
import { actionRequestedMessage, actionResolvedMessage, actionSkippedMessage } from '../messages';

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
    optional?: boolean;
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

function createActionWindowHandler() {
  return {
    execute({ match, step, state }: { match: Match; step: Step; state: StepState }): HandlerResult {
      if (isDone(state, step.id) || state.winner) return completed(state, step.id);
      const runtime = createRuntime(match, state);
      const round = ensureRound(runtime.state, step.config.day!);
      if (step.config.actionType?.startsWith('sheriff_') && shouldSkipSheriffAction(runtime as unknown as ReducerRuntime, round as unknown as ReducerRound, step.config.actionType)) {
        return skipAction(match, step, runtime);
      }
      const actors = getActorsForStep(runtime as unknown as ReducerRuntime, step as unknown as ReducerStep, round as unknown as ReducerRound);
      if (!actors.length) return skipAction(match, step, runtime);

      if (!hasOpenWork(match.id, step.id, step.config.actionType)) {
        return openActionWindow({ match, step, state, runtime, round, actors });
      }

      if (!allActionWorkSucceeded(match.id, step.id, step.config.actionType!, actors.length)) {
        return waitForActionWindow({ match, step, state, round, actors });
      }

      applyActionResults(runtime as unknown as ReducerRuntime, step as unknown as ReducerStep, collectActionResults(match.id, step.id, step.config.actionType!) as unknown as ReducerActionResult[]);
      const nextState = markStepComplete({ ...syncRuntimeState(runtime), currentStep: step.id, currentActionWindow: null }, step.id);
      resolveActionWindow(match.id, step.id, step.config.actionType!, state.currentActionWindow as unknown as ActionWindow);
      return {
        status: 'COMPLETED',
        state: nextState,
        events: [createWerewolfEvent(match, step, nextState as unknown as Record<string, unknown>, 'werewolf_action_submitted', actionResolvedMessage(step.config.actionType, step.config.day))]
      };
    },
    runAiTask: runActionWindowAiTask,
    validateAiResult: validateActionWindowAiResult
  };
}

function skipAction(match: Match, step: Step, runtime: Runtime): HandlerResult {
  const nextState = markStepComplete({ ...syncRuntimeState(runtime), currentStep: step.id }, step.id);
  return {
    status: 'COMPLETED',
    state: nextState,
    events: [createWerewolfEvent(match, step, nextState as unknown as Record<string, unknown>, 'werewolf_action_skipped', actionSkippedMessage(step.config.actionType, step.config.day))]
  };
}

function openActionWindow({ match, step, state, runtime, round, actors }: {
  match: Match;
  step: Step;
  state: StepState;
  runtime: Runtime;
  round: Record<string, unknown>;
  actors: unknown[];
}): HandlerResult {
  if (step.config.actionType === 'wolf_kill' || step.config.actionType === 'wolf_speech' || step.config.actionType === 'wolf_vote') {
    ensureWolfTeamContext(runtime as unknown as ReducerRuntime, round as unknown as ReducerRound);
  }
  const window = buildActionWindow({
    match,
    step,
    state: state as unknown as Record<string, unknown>,
    actionType: step.config.actionType!,
    actors: actors as Parameters<typeof buildActionWindow>[0]['actors'],
    targetIds: getTargetIds(runtime as unknown as ReducerRuntime, step as unknown as ReducerStep),
    optional: Boolean(step.config.optional)
  });
  const nextState = step.config.actionType === 'wolf_kill' || step.config.actionType === 'wolf_speech' || step.config.actionType === 'wolf_vote'
    ? { ...syncRuntimeState(runtime), currentStep: step.id, currentActionWindow: window }
    : { ...state, currentStep: step.id, currentActionWindow: window };
  const work = createActionBlockers({
    match,
    step,
    window,
    actors: actors as Parameters<typeof createActionBlockers>[0]['actors'],
    promptContext: { day: step.config.day, actionType: step.config.actionType, round }
  });
  return {
    status: 'WAITING',
    state: nextState,
    blockers: work.blockers,
    tasks: work.tasks,
    pendingActions: work.pendingActions,
    events: [createWerewolfEvent(match, step, nextState as unknown as Record<string, unknown>, 'werewolf_action_requested', actionRequestedMessage(step.config.actionType, step.config.day), { actionWindow: window })]
  };
}

function waitForActionWindow({ match, step, state, round, actors }: {
  match: Match;
  step: Step;
  state: StepState;
  round: Record<string, unknown>;
  actors: unknown[];
}): HandlerResult {
  const existingWindow = state.currentActionWindow || { id: `${match.id}:${step.id}:${step.config.actionType}` };
  const work = createActionBlockers({
    match,
    step,
    window: existingWindow as Parameters<typeof createActionBlockers>[0]['window'],
    actors: actors as Parameters<typeof createActionBlockers>[0]['actors'],
    promptContext: { day: step.config.day, actionType: step.config.actionType, round }
  });
  return {
    status: 'WAITING',
    state: { ...state, currentStep: step.id },
    blockers: work.blockers,
    tasks: work.tasks,
    pendingActions: work.pendingActions
  };
}

export { createActionWindowHandler };
