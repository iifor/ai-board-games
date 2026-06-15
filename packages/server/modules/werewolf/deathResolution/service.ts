import { CHANNEL_TYPES } from '@ai-presenter/shared/types/channelTypes';
import { recordWorkflowEffects } from '../../workflow-engine/effects';
import { syncRuntimeState } from '../runtime';
import { createWerewolfEvent, markStepComplete } from '../handlers/common';
import { effectResolvedMessage } from '../messages';
import { resolveWinAfterDeathsDetailed } from '../winCheck';
import type { WerewolfAgent } from '../winCheck';
import { resolveActiveSheriffId } from '../sheriffWorkflow';
import { advanceHunterStage } from './hunterStage';
import { advanceSheriffBadgeStage } from './sheriffBadgeStage';
import { advanceLastWordsStage } from './lastWordsStage';
import {
  getCurrentDeath,
  shouldHaveLastWords,
} from './deathQueue';
import type {
  DeathResolutionContext,
  HandlerResult,
} from './types';
import { WEREWOLF_POSTGAME_DAYBREAK_STEP_ID } from '../postgame';

function advanceDeathResolution(context: DeathResolutionContext): HandlerResult {
  for (let index = 0; index < 64; index += 1) {
    const death = getCurrentDeath(context);
    if (!death) return finalizeDeathResolution(context);

    if (!death.wordsCompleted) {
      if (!shouldHaveLastWords(context, death)) {
        death.wordsCompleted = true;
        continue;
      }
      const words = advanceLastWordsStage(context, death.playerId);
      if (words.kind === 'waiting') return mergeWaiting(context, words.result);
      if (words.kind === 'advanced') context.events.push(...(words.events || []));
      death.wordsCompleted = true;
      continue;
    }

    if (!death.skillCompleted) {
      const hunter = advanceHunterStage(context, death.playerId);
      if (hunter.kind === 'waiting') return mergeWaiting(context, hunter.result);
      if (hunter.kind === 'advanced') context.events.push(...(hunter.events || []));
      death.skillCompleted = true;
      continue;
    }

    if (!death.badgeCompleted) {
      const sheriff = advanceSheriffBadgeStage(context, death.playerId);
      if (sheriff.kind === 'waiting') return mergeWaiting(context, sheriff.result);
      if (sheriff.kind === 'advanced') context.events.push(...(sheriff.events || []));
      death.badgeCompleted = true;
      continue;
    }
  }
  throw new Error(`Death resolution exceeded stage limit: ${context.match.id}:${context.step.id}`);
}

function recordInitialEffects(context: DeathResolutionContext, effects: Array<Record<string, unknown>>): void {
  const stableEffects = effects.map((effect, index) => ({
    ...effect,
    id: String(effect.id || [
      context.match.id,
      context.step.id,
      context.checkpoint.source,
      index,
      effect.type || effect.effectType || 'unknown',
      effect.target ?? 'none',
    ].join(':')),
  }));
  recordWorkflowEffects({
    matchId: context.match.id,
    stepId: context.step.id,
    effects: stableEffects,
  });
  context.checkpoint.initialEffects = effects;
  context.checkpoint.initialEffectsApplied = true;
}

function finalizeDeathResolution(context: DeathResolutionContext): HandlerResult {
  const day = context.step.config.day || Number(context.round.day) || 1;
  const resolution = resolveWinAfterDeathsDetailed(
    context.runtime.agents as WerewolfAgent[],
    context.round as never,
    day,
    context.runtime.modeConfig as Record<string, unknown> || {},
    resolveActiveSheriffId(context.runtime as never, context.round as never),
  );
  const winResult = resolution.result;
  context.checkpoint.finalized = true;
  const nextState = markStepComplete({
    ...syncRuntimeState(context.runtime),
    currentStep: context.step.id,
    currentActionWindow: null,
    ...(winResult.winner ? { winner: winResult.winner, winReason: winResult.winReason } : {}),
  }, context.step.id);
  const events = [...context.events];
  if (resolution.rejectedLock) {
    events.push({
      ...createWerewolfEvent(
        context.match,
        context.step,
        nextState as unknown as Record<string, unknown>,
        'werewolf_winner_lock_rejected',
        'winner lock rejected',
        {
          reason: resolution.rejectedLock.reason,
          winnerLock: resolution.rejectedLock.winnerLock,
          currentRoster: resolution.rejectedLock.currentRoster,
          winCondition: resolution.rejectedLock.winCondition,
        },
        {
          channel: CHANNEL_TYPES.SYSTEM,
          idempotencyKey: `${context.match.id}:${context.step.id}:winner_lock_rejected`,
        },
      ),
      visibility: 'system',
    });
  }
  events.push(createWerewolfEvent(
    context.match,
    context.step,
    nextState as unknown as Record<string, unknown>,
    'werewolf_effect_resolved',
    effectResolvedMessage(context.checkpoint.source === 'night' ? 'night' : 'day', day),
    { effects: context.checkpoint.initialEffects },
    {
      channel: CHANNEL_TYPES.PUBLIC,
      idempotencyKey: `${context.match.id}:${context.step.id}:death_resolution:completed`,
    },
  ));
  if (winResult.winner) {
    events.push(createWerewolfEvent(
      context.match,
      context.step,
      nextState as unknown as Record<string, unknown>,
      'werewolf_game_result',
      winResult.winReason,
      { winner: winResult.winner },
      {
        channel: CHANNEL_TYPES.PUBLIC,
        idempotencyKey: `${context.match.id}:${context.step.id}:werewolf_game_result`,
      },
    ));
  }
  return {
    status: 'COMPLETED',
    state: nextState,
    events,
    ...(winResult.winner ? { nextStepId: WEREWOLF_POSTGAME_DAYBREAK_STEP_ID } : {}),
  };
}

function mergeWaiting(context: DeathResolutionContext, result: HandlerResult): HandlerResult {
  return {
    ...result,
    events: [...(result.events || []), ...context.events],
  };
}

export {
  advanceDeathResolution,
  recordInitialEffects,
};
