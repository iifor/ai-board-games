import {
  allActionWorkSucceeded,
  buildActionWindow,
  collectActionResults,
  createActionBlockers,
  hasOpenWork,
  resolveActionWindow,
} from '../actionWindows';
import type { ActionWindow } from '../actionWindows';
import { applyLastWordsResult, getPendingLastWords } from '../lastWordsWorkflow';
import { syncRuntimeState, serializeWerewolfState } from '../runtime';
import { createWerewolfEvent, publishGameEvent } from '../handlers/common';
import { actionRequestedMessage } from '../messages';
import { CHANNEL_TYPES } from '@ai-presenter/shared/types/channelTypes';
import { appendUnique } from './types';
import type { DeathResolutionContext, StageResult } from './types';

async function advanceLastWordsStage(context: DeathResolutionContext, playerId: number): Promise<StageResult> {
  const pending = getPendingLastWords(context.round).find(
    (item) => Number(item.playerId) === Number(playerId),
  );
  if (!pending) return { kind: 'idle' };
  const actor = context.runtime.agents.find(
    (candidate) => Number(candidate.id) === Number(playerId),
  );
  if (!actor) {
    applyLastWordsResult(context.round, playerId, undefined);
    return { kind: 'advanced' };
  }
  const actors = [actor];

  const actionType = 'last_words';
  const actorActionKey = `${actionType}:${playerId}`;
  const currentWindow = context.state.currentActionWindow as ActionWindow | null | undefined;
  const hasActorWork = await hasOpenWork(context.match.id, context.step.id, actorActionKey, context.db);
  const hasLegacyWork = await hasOpenWork(context.match.id, context.step.id, actionType, context.db);
  const resumesLegacyWindow = !hasActorWork
    && hasLegacyWork
    && currentWindow?.actionType === actionType
    && currentWindow.actorIds?.some((id) => Number(id) === Number(playerId));
  const taskActionKey = resumesLegacyWindow ? actionType : actorActionKey;
  const legacyEpochId = `${context.match.id}:${context.step.id}:${actionType}`;
  const epochActionKey = currentWindow?.id === legacyEpochId ? actionType : actorActionKey;
  const actionStep = { ...context.step, config: { ...context.step.config, actionType, ordered: true } };
  if (!await hasOpenWork(context.match.id, context.step.id, taskActionKey, context.db)) {
    const window = await buildActionWindow({
      match: context.match,
      step: actionStep,
      state: context.state as unknown as Record<string, unknown>,
      actionType,
      epochActionType: actorActionKey,
      actors,
      targetIds: [],
      optional: false,
      db: context.db,
    });
    const work = await createActionBlockers({
      match: context.match,
      step: actionStep,
      window,
      actors,
      promptContext: { day: context.round.day, actionType, round: context.round },
      taskActionType: taskActionKey,
      db: context.db,
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
            idempotencyKey: `${context.match.id}:${context.step.id}:${actionType}:requested:${playerId}`,
          },
        )],
      },
    };
  }

  if (!await allActionWorkSucceeded(context.match.id, context.step.id, taskActionKey, actors.length, context.db)) {
    const window = context.state.currentActionWindow || {
      id: `${context.match.id}:${context.step.id}:${epochActionKey}`,
      actionType,
      epochActionType: epochActionKey,
    };
    const work = await createActionBlockers({
      match: context.match,
      step: actionStep,
      window: window as Parameters<typeof createActionBlockers>[0]['window'],
      actors,
      promptContext: { day: context.round.day, actionType, round: context.round },
      taskActionType: taskActionKey,
      db: context.db,
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

  const result = (await collectActionResults(context.match.id, context.step.id, taskActionKey, context.db))
    .find((item) => Number(item.actorId) === Number(playerId));
  await resolveActionWindow(
    context.match.id,
    context.step.id,
    epochActionKey,
    context.state.currentActionWindow as unknown as ActionWindow,
    context.db,
  );
  const testimony = applyLastWordsResult(context.round, playerId, result);
  if (!testimony) return { kind: 'advanced' };
  appendUnique(context.checkpoint.completedLastWordsIds, testimony.playerId);
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
    return testimony.source === 'exile'
      ? builder.buildExileWords(testimony)
      : builder.buildLastWords(testimony);
  }, serializeWerewolfState(context.match, context.state as unknown as Record<string, unknown>));
  return {
    kind: 'advanced',
    events: [createWerewolfEvent(
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
    )],
  };
}

export { advanceLastWordsStage };
