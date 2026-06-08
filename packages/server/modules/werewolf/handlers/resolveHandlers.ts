import { CHANNEL_TYPES } from '@ai-presenter/shared/types/channelTypes';
import { resolveExileEffects, resolveNightEffects } from '../effects';
import {
  createRuntime,
  ensureRound,
  serializeWerewolfState,
  syncRuntimeState,
} from '../runtime';
import {
  isSheriffResolveReady,
  resolveSheriffElection,
  shouldRunSheriffElection,
} from '../sheriffWorkflow';
import { runDeathActionAiTask, validateDeathActionAiResult } from '../aiActions';
import {
  completed,
  createWerewolfEvent,
  isDone,
  markStepComplete,
  publishGameEvent,
} from './common';
import type { StepState } from './common';
import { actionResolvedMessage } from '../messages';
import { getActiveTrace, recordSnapshot } from '../../observability/tracer';
import { getSeatNumber } from '../utils';
import { auditNightResolutionShadow } from '../engineNightResolutionAudit';
import type { NightResolutionShadowAudit } from '../engineNightResolutionAudit';
import {
  enqueueExileLastWords,
  enqueueNightLastWords,
} from '../lastWordsWorkflow';
import {
  advanceDeathResolution,
  recordInitialEffects,
} from '../deathResolution/service';
import { ensureDeathResolutionCheckpoint } from '../deathResolution/types';
import type {
  DeathResolutionContext,
  HandlerResult,
  Match,
  Step,
} from '../deathResolution/types';
function createNightResolveHandler() {
  return {
    execute({ match, step, state }: { match: Match; step: Step; state: StepState }): HandlerResult {
      if (isDone(state, step.id) || state.winner) return completed(state, step.id);
      const runtime = createRuntime(match, state);
      const round = ensureRound(runtime.state, step.config.day!) as DeathResolutionContext['round'];
      const checkpoint = ensureDeathResolutionCheckpoint(round, step, 'night');
      const context: DeathResolutionContext = {
        match,
        step,
        state,
        runtime,
        round,
        checkpoint,
        events: [],
      };
      let shadowAuditEvent: unknown | null = null;
      if (!checkpoint.initialEffectsApplied) {
        const day = step.config.day || Number(round.day) || 1;
        const stateBeforeLegacy = cloneRecord(runtime.state as unknown as Record<string, unknown>);
        const resolved = resolveNightEffects(runtime.agents as never, round as never, runtime.modeConfig as never);
        checkpoint.initialDeathIds = resolved.deaths.map((death) => Number(death.id));
        recordInitialEffects(context, resolved.effects as unknown as Array<Record<string, unknown>>);
        enqueueNightLastWords(round, checkpoint.initialDeathIds);
        if (!checkpoint.shadowAudited) {
          const audit = auditNightResolutionShadow({
            stateBeforeLegacy,
            day,
            legacy: {
              effects: resolved.effects as unknown as Array<Record<string, unknown>>,
              deaths: resolved.deaths,
            },
          });
          shadowAuditEvent = createNightResolutionShadowAuditEvent(match, step, stateBeforeLegacy, audit);
          checkpoint.shadowAudited = true;
        }
      } else {
        enqueueNightLastWords(round, checkpoint.initialDeathIds);
      }
      context.state = {
        ...syncRuntimeState(runtime),
        currentStep: step.id,
        currentActionWindow: state.currentActionWindow || null,
      };
      publishNightResultOnce(context);
      const result = advanceDeathResolution(context);
      if (shadowAuditEvent) result.events = [...(result.events || []), shadowAuditEvent];
      if (result.status === 'COMPLETED') {
        recordGameSnapshotIfTrace(match.id, runtime as unknown as Record<string, unknown>, 'night_resolve');
      }
      return result;
    },
    runAiTask: runDeathActionAiTask,
    validateAiResult: validateDeathActionAiResult,
  };
}
function createExileResolveHandler() {
  return {
    execute({ match, step, state }: { match: Match; step: Step; state: StepState }): HandlerResult {
      if (isDone(state, step.id) || state.winner) return completed(state, step.id);
      const runtime = createRuntime(match, state);
      const round = ensureRound(runtime.state, step.config.day!) as DeathResolutionContext['round'];
      const checkpoint = ensureDeathResolutionCheckpoint(round, step, 'exile');
      const context: DeathResolutionContext = {
        match,
        step,
        state,
        runtime,
        round,
        checkpoint,
        events: [],
      };
      if (!checkpoint.initialEffectsApplied) {
        const resolved = resolveExileEffects(runtime.agents as never, round as never, runtime.modeConfig as never);
        checkpoint.initialDeathIds = resolved.exile ? [Number(resolved.exile.id)] : [];
        recordInitialEffects(context, resolved.effects as unknown as Array<Record<string, unknown>>);
        enqueueExileLastWords(round, resolved.exile?.id);
        // 白痴翻牌：发布播报事件到 EventBus（携带 game snapshot 供 C 端更新 round.idiotReveal）
        if (round.idiotReveal) {
          const snapshot = serializeWerewolfState(context.match, syncRuntimeState(runtime));
          publishGameEvent(context.runtime.eventBus, context.runtime.gameEventBuilder, (builder) => {
            builder.setStep(context.step.id);
            builder.setPhase('day');
            builder.setDay(context.step.config.day || 1);
            return builder.build('idiot-reveal', {
              playerId: round.idiotReveal.id,
              idiotReveal: { id: round.idiotReveal.id },
              message: `${getSeatNumber(Number(round.idiotReveal.id), context.runtime.agents)}号白痴翻牌`,
            });
          }, snapshot);
        }
      } else {
        enqueueExileLastWords(round, checkpoint.initialDeathIds[0]);
      }
      context.state = {
        ...syncRuntimeState(runtime),
        currentStep: step.id,
        currentActionWindow: state.currentActionWindow || null,
      };
      publishExileResultOnce(context);
      const result = advanceDeathResolution(context);
      if (result.status === 'COMPLETED') {
        recordGameSnapshotIfTrace(match.id, runtime as unknown as Record<string, unknown>, 'exile_resolve');
      }
      return result;
    },
    runAiTask: runDeathActionAiTask,
    validateAiResult: validateDeathActionAiResult,
  };
}
function publishExileResultOnce(context: DeathResolutionContext): void {
  if (context.checkpoint.resultPublished) return;
  context.checkpoint.resultPublished = true;
  const exile = context.round.exile;
  if (!exile) return;
  publishGameEvent(context.runtime.eventBus, context.runtime.gameEventBuilder, (builder) => {
    builder.setStep(context.step.id).setPhase('day').setDay(context.step.config.day || 1);
    return builder.buildVoteResult(
      (context.round.votes as Record<string, number | null> | undefined) || {},
      (context.round.voteTally as Record<string, number> | undefined) || {},
      exile,
      `${getSeatNumber(exile.id, context.runtime.agents)}号玩家被放逐，请发表遗言`,
    );
  }, serializeWerewolfState(context.match, context.state as unknown as Record<string, unknown>));
}
function publishNightResultOnce(context: DeathResolutionContext): void {
  if (context.checkpoint.nightResultPublished) return;
  context.checkpoint.nightResultPublished = true;
  const deaths = (context.round.night as { deaths?: Array<{ id: number; reason: string }> } | undefined)?.deaths || [];
  const message = deaths.length
    ? `昨晚${deaths.map((death) => `${getSeatNumber(death.id, context.runtime.agents)}号玩家`).join('、')}死亡`
    : '昨晚是平安夜';
  publishGameEvent(context.runtime.eventBus, context.runtime.gameEventBuilder, (builder) => {
    builder.setStep(context.step.id).setPhase('day').setDay(context.step.config.day || 1);
    return builder.buildNightResult(deaths, message);
  }, serializeWerewolfState(context.match, context.state as unknown as Record<string, unknown>));
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
      const nextState = markStepComplete({
        ...syncRuntimeState(runtime),
        currentStep: step.id,
        currentActionWindow: null,
      }, step.id);
      if (round.sheriffId) {
        const message = `${getSeatNumber(Number(round.sheriffId), runtime.agents)}号玩家当选警长。`;
        publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
          builder.setStep(step.id).setPhase('day').setDay(step.config.day || 1);
          return builder.buildSheriffEvent('sheriff-result', {
            election: (round.sheriffElection || {}) as Record<string, unknown>,
            sheriffId: Number(round.sheriffId),
            message,
          });
        }, serializeWerewolfState(match, nextState as unknown as Record<string, unknown>));
      }
      return {
        status: 'COMPLETED',
        state: nextState,
        events: [createWerewolfEvent(
          match,
          step,
          nextState as unknown as Record<string, unknown>,
          'werewolf_effect_resolved',
          actionResolvedMessage('sheriff_resolve', step.config.day),
          { sheriffElection: round.sheriffElection, sheriffId: round.sheriffId },
          { channel: CHANNEL_TYPES.PUBLIC },
        )],
      };
    },
  };
}

function createNightResolutionShadowAuditEvent(
  match: Match,
  step: Step,
  state: Record<string, unknown>,
  audit: NightResolutionShadowAudit,
): unknown {
  return {
    ...createWerewolfEvent(
      match,
      step,
      state,
      'werewolf_night_resolution_shadow_audited',
      'night resolution shadow audit',
      {
        day: audit.day,
        status: audit.status,
        legacy: audit.legacy,
        engine: audit.engine,
        mismatches: audit.mismatches,
        error: audit.error,
      },
      {
        channel: CHANNEL_TYPES.SYSTEM,
        idempotencyKey: `${match.id}:${step.id}:night_resolution_shadow`,
      },
    ),
    visibility: 'system',
  };
}

function recordGameSnapshotIfTrace(matchId: string, runtime: Record<string, unknown>, checkpoint: string): void {
  try {
    const trace = getActiveTrace(matchId);
    if (!trace) return;
    const snapshot = serializeWerewolfState({ id: matchId }, runtime);
    recordSnapshot(trace, checkpoint, snapshot, {
      day: (runtime.rounds as Array<Record<string, unknown>> | undefined)?.length || undefined,
      phase: runtime.phase as string || undefined,
    });
  } catch {
    // Trace snapshots are best-effort and must not block game resolution.
  }
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value || {})) as Record<string, unknown>;
}

export {
  createNightResolveHandler,
  createExileResolveHandler,
  createSheriffResolveHandler,
};
