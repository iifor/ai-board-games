import {
  allActionWorkSucceeded,
  buildActionWindow,
  collectActionResults,
  createActionBlockers,
  hasOpenWork,
  resolveActionWindow,
} from '../actionWindows';
import type { ActionWindow } from '../actionWindows';
import { applyHunterShot } from '../effects';
import { findPendingHunter } from '../reducers';
import type { Agent as ReducerAgent, Round as ReducerRound } from '../reducers';
import { syncRuntimeState } from '../runtime';
import { createWerewolfEvent } from '../handlers/common';
import { actionRequestedMessage, actionResolvedMessage } from '../messages';
import { CHANNEL_TYPES } from '@ai-presenter/shared/types/channelTypes';
import { recordWorkflowEffects } from '../../workflow-engine/effects';
import { recordWerewolfInteractionFeedback } from '../interactionFeedbackTrace';
import { enqueueNightLastWords } from '../lastWordsWorkflow';
import { appendUnique } from './types';
import type { DeathResolutionContext, StageResult } from './types';

function advanceHunterStage(context: DeathResolutionContext): StageResult {
  const hunter = findPendingDeathHunter(context);
  if (!hunter) return { kind: 'idle' };

  const actionType = 'hunter_shot';
  const actorId = Number(hunter.id);
  const currentWindow = context.state.currentActionWindow as ActionWindow | null | undefined;
  const actorActionKey = `${actionType}:${actorId}`;
  const hasActorWork = hasOpenWork(context.match.id, context.step.id, actorActionKey);
  const hasLegacyWork = hasOpenWork(context.match.id, context.step.id, actionType);
  const resumesLegacyWindow = !hasActorWork
    && hasLegacyWork
    && currentWindow?.actionType === actionType
    && currentWindow.actorIds?.some((id) => Number(id) === actorId);
  const taskActionKey = resumesLegacyWindow ? actionType : actorActionKey;
  const legacyEpochId = `${context.match.id}:${context.step.id}:${actionType}`;
  const epochActionKey = currentWindow?.id === legacyEpochId ? actionType : actorActionKey;
  const actionStep = { ...context.step, config: { ...context.step.config, actionType } };
  if (!hasOpenWork(context.match.id, context.step.id, taskActionKey)) {
    const window = buildActionWindow({
      match: context.match,
      step: actionStep,
      state: context.state as unknown as Record<string, unknown>,
      actionType,
      epochActionType: actorActionKey,
      actors: [hunter],
      targetIds: context.runtime.agents.filter((agent) => agent.alive).map((agent) => agent.id),
      optional: false,
    });
    const work = createActionBlockers({
      match: context.match,
      step: actionStep,
      window,
      actors: [hunter],
      promptContext: { day: context.round.day, actionType, round: context.round },
      taskActionType: taskActionKey,
    });
    return {
      kind: 'waiting',
      result: {
        status: 'WAITING',
        state: { ...context.state, currentStep: context.step.id, currentActionWindow: window },
        blockers: work.blockers,
        tasks: work.tasks,
        pendingActions: work.pendingActions,
        events: [createWerewolfEvent(
          context.match,
          context.step,
          context.state as unknown as Record<string, unknown>,
          'werewolf_action_requested',
          actionRequestedMessage(actionType, context.round.day),
          { actionType, actionWindow: window },
          {
            channel: CHANNEL_TYPES.PUBLIC,
            idempotencyKey: `${context.match.id}:${context.step.id}:${actionType}:requested:${actorId}`,
          },
        )],
      },
    };
  }

  if (!allActionWorkSucceeded(context.match.id, context.step.id, taskActionKey, 1)) {
    const window = context.state.currentActionWindow || {
      id: `${context.match.id}:${context.step.id}:${epochActionKey}`,
      actionType,
      epochActionType: epochActionKey,
    };
    const work = createActionBlockers({
      match: context.match,
      step: actionStep,
      window: window as Parameters<typeof createActionBlockers>[0]['window'],
      actors: [hunter],
      promptContext: { day: context.round.day, actionType, round: context.round },
      taskActionType: taskActionKey,
    });
    return {
      kind: 'waiting',
      result: {
        status: 'WAITING',
        state: { ...context.state, currentStep: context.step.id },
        blockers: work.blockers,
        tasks: work.tasks,
        pendingActions: work.pendingActions,
      },
    };
  }

  const result = collectActionResults(context.match.id, context.step.id, taskActionKey)
    .find((item) => Number(item.actorId) === actorId);
  const target = Number(result?.payload?.target);
  const effect = applyHunterShot(context.runtime.agents as never, context.round as never, {
    from: actorId,
    target,
    reason: context.round.phase as string | undefined,
  });
  if (effect && context.step.config.phase === 'night') enqueueNightLastWords(context.round, [target]);
  recordWerewolfInteractionFeedback({
    matchId: context.match.id,
    actionType,
    actorId,
    payload: {
      ...(result?.payload || {}),
      target: effect ? target : null,
      reason: context.round.phase,
    },
    round: context.round,
    day: context.round.day,
    phase: String(context.round.phase || context.step.config.phase || ''),
    reason: String(context.round.phase || ''),
  });
  resolveActionWindow(
    context.match.id,
    context.step.id,
    epochActionKey,
    context.state.currentActionWindow as unknown as ActionWindow,
  );
  if (effect) {
    recordWorkflowEffects({
      matchId: context.match.id,
      stepId: context.step.id,
      effects: [{
        ...(effect as unknown as Record<string, unknown>),
        id: `${context.match.id}:${context.step.id}:hunter:${actorId}:${target}`,
      }],
    });
  }
  appendUnique(context.checkpoint.completedHunterIds, actorId);
  context.state = {
    ...syncRuntimeState(context.runtime),
    currentStep: context.step.id,
    currentActionWindow: null,
  };
  return {
    kind: 'advanced',
    events: [createWerewolfEvent(
      context.match,
      context.step,
      context.state as unknown as Record<string, unknown>,
      'werewolf_effect_resolved',
      actionResolvedMessage(actionType, context.round.day),
      { actionType, effects: effect ? [effect] : [] },
      {
        channel: CHANNEL_TYPES.PUBLIC,
        idempotencyKey: `${context.match.id}:${context.step.id}:${actionType}:resolved:${actorId}`,
      },
    )],
  };
}

function findPendingDeathHunter(context: DeathResolutionContext): ReducerAgent | null {
  const day = Number(context.round.day);
  const deaths = context.runtime.agents
    .filter((agent) => !agent.alive && Number(agent.deathDay) === day)
    .map((agent) => ({ id: Number(agent.id), reason: String(agent.deathReason || 'death') }));
  return findPendingHunter(
    context.runtime.agents as unknown as ReducerAgent[],
    context.round as unknown as ReducerRound,
    deaths,
  );
}

export { advanceHunterStage };
