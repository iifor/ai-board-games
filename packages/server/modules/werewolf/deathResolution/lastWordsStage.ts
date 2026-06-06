import {
  allActionWorkSucceeded,
  buildActionWindow,
  collectActionResults,
  createActionBlockers,
  hasOpenWork,
  resolveActionWindow,
} from '../actionWindows';
import type { ActionWindow } from '../actionWindows';
import { applyLastWordsResults, getPendingLastWords } from '../lastWordsWorkflow';
import { syncRuntimeState, serializeWerewolfState } from '../runtime';
import { createWerewolfEvent, publishGameEvent } from '../handlers/common';
import { actionRequestedMessage } from '../messages';
import { CHANNEL_TYPES } from '@ai-presenter/shared/types/channelTypes';
import { appendUnique } from './types';
import type { DeathResolutionContext, StageResult } from './types';

function advanceLastWordsStage(context: DeathResolutionContext): StageResult {
  const pending = getPendingLastWords(context.round);
  if (!pending.length) return { kind: 'idle' };
  const actors = pending
    .map((item) => context.runtime.agents.find((agent) => Number(agent.id) === Number(item.playerId)))
    .filter((actor): actor is NonNullable<typeof actor> => Boolean(actor));
  if (!actors.length) {
    applyLastWordsResults(context.round, []);
    return { kind: 'advanced' };
  }

  const actionType = 'last_words';
  const actionStep = { ...context.step, config: { ...context.step.config, actionType, ordered: true } };
  if (!hasOpenWork(context.match.id, context.step.id, actionType)) {
    const window = buildActionWindow({
      match: context.match,
      step: actionStep,
      state: context.state as unknown as Record<string, unknown>,
      actionType,
      actors,
      targetIds: [],
      optional: false,
    });
    const work = createActionBlockers({
      match: context.match,
      step: actionStep,
      window,
      actors,
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
            idempotencyKey: `${context.match.id}:${context.step.id}:${actionType}:requested:${pending.map((item) => item.playerId).join('-')}`,
          },
        )],
      },
    };
  }

  if (!allActionWorkSucceeded(context.match.id, context.step.id, actionType, actors.length)) {
    const window = context.state.currentActionWindow || { id: `${context.match.id}:${context.step.id}:${actionType}` };
    const work = createActionBlockers({
      match: context.match,
      step: actionStep,
      window: window as Parameters<typeof createActionBlockers>[0]['window'],
      actors,
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

  const results = collectActionResults(context.match.id, context.step.id, actionType);
  resolveActionWindow(
    context.match.id,
    context.step.id,
    actionType,
    context.state.currentActionWindow as unknown as ActionWindow,
  );
  const testimonies = applyLastWordsResults(context.round, results);
  testimonies.forEach((testimony) => appendUnique(context.checkpoint.completedLastWordsIds, testimony.playerId));
  context.state = {
    ...syncRuntimeState(context.runtime),
    currentStep: context.step.id,
    currentActionWindow: null,
  };
  const events = testimonies.map((testimony) => {
    publishGameEvent(context.runtime.eventBus, context.runtime.gameEventBuilder, (builder) => {
      builder
        .setStep(context.step.id)
        .setPhase((context.step.config.phase as 'night' | 'day') || 'day')
        .setDay(context.step.config.day || 1);
      return testimony.source === 'exile'
        ? builder.buildExileWords(testimony)
        : builder.buildLastWords(testimony);
    }, serializeWerewolfState(context.match, context.state as unknown as Record<string, unknown>));
    return createWerewolfEvent(
      context.match,
      context.step,
      context.state as unknown as Record<string, unknown>,
      testimony.source === 'exile' ? 'werewolf_exile_words' : 'werewolf_last_words',
      testimony.text,
      { actionType, testimony },
      {
        channel: CHANNEL_TYPES.PUBLIC,
        idempotencyKey: `${context.match.id}:${context.step.id}:${testimony.source}_words:${testimony.playerId}`,
      },
    );
  });
  return { kind: 'advanced', events };
}

export { advanceLastWordsStage };
