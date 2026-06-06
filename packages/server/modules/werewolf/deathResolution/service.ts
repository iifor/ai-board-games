import { CHANNEL_TYPES } from '@ai-presenter/shared/types/channelTypes';
import { MATCH_STATUS } from '@ai-presenter/shared/types/workflowTypes';
import { recordWorkflowEffects } from '../../workflow-engine/effects';
import { syncRuntimeState } from '../runtime';
import { createWerewolfEvent, markStepComplete } from '../handlers/common';
import { effectResolvedMessage } from '../messages';
import { resolveWinAfterDeathsDetailed } from '../winCheck';
import type { WerewolfAgent } from '../winCheck';
import { advanceHunterStage } from './hunterStage';
import { advanceSheriffBadgeStage } from './sheriffBadgeStage';
import { advanceLastWordsStage } from './lastWordsStage';
import type {
  DeathResolutionContext,
  HandlerResult,
} from './types';

function advanceDeathResolution(context: DeathResolutionContext): HandlerResult {
  for (let index = 0; index < 64; index += 1) {
    const hunter = advanceHunterStage(context);
    if (hunter.kind === 'waiting') return mergeWaiting(context, hunter.result);
    if (hunter.kind === 'advanced') {
      context.events.push(...(hunter.events || []));
      continue;
    }

    const sheriff = advanceSheriffBadgeStage(context);
    if (sheriff.kind === 'waiting') return mergeWaiting(context, sheriff.result);
    if (sheriff.kind === 'advanced') {
      context.events.push(...(sheriff.events || []));
      continue;
    }

    const lastWords = advanceLastWordsStage(context);
    if (lastWords.kind === 'waiting') return mergeWaiting(context, lastWords.result);
    if (lastWords.kind === 'advanced') {
      context.events.push(...(lastWords.events || []));
      continue;
    }

    return finalizeDeathResolution(context);
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
      'werewolf_game_completed',
      winResult.winReason,
      { winner: winResult.winner },
      {
        channel: CHANNEL_TYPES.PUBLIC,
        idempotencyKey: `${context.match.id}:${context.step.id}:werewolf_game_completed`,
      },
    ));
  }
  return {
    status: 'COMPLETED',
    state: nextState,
    events,
    ...(winResult.winner ? { matchStatus: MATCH_STATUS.COMPLETED } : {}),
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
