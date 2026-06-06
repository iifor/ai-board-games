import {
  allActionWorkSucceeded,
  buildActionWindow,
  collectActionResults,
  createActionBlockers,
  hasOpenWork,
  resolveActionWindow,
} from '../actionWindows';
import type { ActionWindow } from '../actionWindows';
import {
  applySheriffBadgeDisposition,
  findPendingSheriffBadgeDisposition,
} from '../sheriffWorkflow';
import { syncRuntimeState, serializeWerewolfState } from '../runtime';
import { createWerewolfEvent, publishGameEvent } from '../handlers/common';
import { actionRequestedMessage } from '../messages';
import { buildSheriffBadgeMessage } from '../utils';
import { CHANNEL_TYPES } from '@ai-presenter/shared/types/channelTypes';
import { appendUnique } from './types';
import type { DeathResolutionContext, StageResult } from './types';

function advanceSheriffBadgeStage(context: DeathResolutionContext): StageResult {
  const sheriff = findPendingSheriffBadgeDisposition(context.runtime as never, context.round as never);
  if (!sheriff) return { kind: 'idle' };

  const actorId = Number(sheriff.id);
  const actionType = 'sheriff_badge_disposition';
  const targetIds = context.runtime.agents
    .filter((agent) => agent.alive && Number(agent.id) !== actorId)
    .map((agent) => Number(agent.id));
  if (!targetIds.length) {
    return applyDisposition(context, sheriff, {
      action: 'tear',
      target: null,
      reason: 'no-valid-target',
    });
  }

  const actionStep = { ...context.step, config: { ...context.step.config, actionType } };
  if (!hasOpenWork(context.match.id, context.step.id, actionType)) {
    const window = buildActionWindow({
      match: context.match,
      step: actionStep,
      state: context.state as unknown as Record<string, unknown>,
      actionType,
      actors: [sheriff],
      targetIds,
      optional: false,
    });
    const work = createActionBlockers({
      match: context.match,
      step: actionStep,
      window,
      actors: [sheriff],
      promptContext: { day: context.round.day, actionType, round: context.round },
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

  if (!allActionWorkSucceeded(context.match.id, context.step.id, actionType, 1)) {
    const window = context.state.currentActionWindow || { id: `${context.match.id}:${context.step.id}:${actionType}` };
    const work = createActionBlockers({
      match: context.match,
      step: actionStep,
      window: window as Parameters<typeof createActionBlockers>[0]['window'],
      actors: [sheriff],
      promptContext: { day: context.round.day, actionType, round: context.round },
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
  const result = collectActionResults(context.match.id, context.step.id, actionType)
    .find((item) => Number(item.actorId) === actorId);
  resolveActionWindow(
    context.match.id,
    context.step.id,
    actionType,
    context.state.currentActionWindow as unknown as ActionWindow,
  );
  return applyDisposition(context, sheriff, result?.payload || {});
}

function applyDisposition(
  context: DeathResolutionContext,
  sheriff: Parameters<typeof applySheriffBadgeDisposition>[2],
  payload: Record<string, unknown>,
): StageResult {
  const actorId = Number(sheriff.id);
  const transfer = applySheriffBadgeDisposition(
    context.runtime as never,
    context.round as never,
    sheriff as never,
    payload,
  );
  const message = buildSheriffBadgeMessage(transfer, context.runtime.agents);
  appendUnique(context.checkpoint.completedSheriffIds, actorId);
  context.state = {
    ...syncRuntimeState(context.runtime),
    currentStep: context.step.id,
    currentActionWindow: null,
  };
  publishGameEvent(context.runtime.eventBus, context.runtime.gameEventBuilder, (builder) => {
    builder
      .setStep(context.step.id)
      .setPhase((context.step.config.phase as 'night' | 'day') || 'day')
      .setDay(context.step.config.day || 1);
    return transfer.action === 'transfer'
      ? builder.buildSheriffBadgeTransfer({ ...transfer }, message)
      : builder.buildSheriffBadgeTear({ ...transfer }, message);
  }, serializeWerewolfState(context.match, context.state as unknown as Record<string, unknown>));
  return {
    kind: 'advanced',
    events: [createWerewolfEvent(
      context.match,
      context.step,
      context.state as unknown as Record<string, unknown>,
      transfer.action === 'transfer' ? 'werewolf_sheriff_badge_transfer' : 'werewolf_sheriff_badge_tear',
      message,
      { actionType: 'sheriff_badge_disposition', sheriffTransfer: transfer },
      {
        channel: CHANNEL_TYPES.PUBLIC,
        idempotencyKey: `${context.match.id}:${context.step.id}:sheriff_badge:${actorId}`,
      },
    )],
  };
}

export { advanceSheriffBadgeStage };
