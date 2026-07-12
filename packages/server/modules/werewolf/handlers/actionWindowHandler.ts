import {
  buildActionWindow,
  createActionBlockers,
  hasOpenWork,
  collectActionResults,
  resolveActionWindow
} from '../actionWindows';
import type { ActionWindow } from '../actionWindows';
import { createRuntime, ensureRound, syncRuntimeState, serializeWerewolfState } from '../runtime';
import type { Runtime } from '../runtime';
import {
  applyActionResults,
  applySelfDestruct,
  getActorsForStep,
  getTargetIds,
  getWitchActionEligibility,
  hasSelfDestruct,
} from '../reducers';
import type { ActionResult as ReducerActionResult, Runtime as ReducerRuntime, Round as ReducerRound, Step as ReducerStep } from '../reducers';
import { shouldSkipSheriffAction } from '../sheriffWorkflow';
import { ensureWolfTeamContext } from '../wolfTeam';
import { runActionWindowAiTask, validateActionWindowAiResult } from '../aiActions';
import { createWerewolfEvent, publishGameEvent, completed, isDone, markStepComplete } from './common';
import type { StepState } from './common';
import { actionRequestedMessage, actionResolvedMessage, actionSkippedMessage, phaseStartMessage, phaseResultMessage, phaseEndMessage, buildDaySpeechOrderAnnouncement } from '../messages';
import { hasActionPhase, getActionPhaseConfig } from '../actionPhases';
import { resolveActionChannel } from './actionChannel';
import { CHANNEL_TYPES } from '@ai-presenter/shared/types/channelTypes';
import { getSeatNumber } from '../utils';
import { recordWerewolfInteractionFeedback } from '../interactionFeedbackTrace';
import { canUseWerewolfActionEngineBridge, runWerewolfActionEngineBridge } from '../actionEngineBridge';
import type { WerewolfActionEngineShadowAudit } from '../actionEngineBridge';

/** 已有独立睁眼事件的夜晚行动 — phase-start 不再重复发布 */
const NIGHT_WAKE_ACTIONS = new Set([
  'wolf_speech', 'wolf_vote', 'wolf_kill',
  'escape_hunter_speech', 'escape_hunter_vote',
  'seer_check', 'guard_protect', 'witch_save', 'witch_poison',
  'hybrid_choose_master', 'elder_silence', 'butterfly_hug', 'stalker_assassinate',
  'wolf_beauty_charm', 'demon_inspect', 'nightmare_fear', 'dreamer_dream', 'magician_swap',
  'fortune_teller_mark', 'big_bad_wolf_kill', 'crow_curse', 'penguin_freeze', 'fox_inspect', 'bear_tamer_roar',
  'black_merchant_gift', 'lucky_seer_check', 'lucky_witch_poison', 'younger_brother_kill',
  'demon_hunter_hunt', 'spirit_wolf_learn', 'spirit_wolf_inspect', 'spirit_wolf_guard', 'spirit_wolf_antidote',
  'wolf_witch_curse', 'illusionist_illusion',
]);

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
  nextStepId?: string;
}

function createActionWindowHandler() {
  return {
    execute({ match, step, state }: { match: Match; step: Step; state: StepState }): HandlerResult {
      const isPostgameAction = step.config.actionType === 'mvp_vote' || step.config.actionType === 'postgame_speech';
      if (isDone(state, step.id) || (state.winner && !isPostgameAction)) return completed(state, step.id);
      const runtime = createRuntime(match, state);
      // Phase 4 fix: 将游戏状态快照注入 builder，使后续事件携带 game.players
      if (runtime.gameEventBuilder) {
        const snapshot = serializeWerewolfState(match, state as unknown as Record<string, unknown>);
        runtime.gameEventBuilder.setGame(snapshot as unknown as Parameters<typeof runtime.gameEventBuilder.setGame>[0]);
      }
      const actionDay = resolveActionDay(state, step);
      const round = ensureRound(runtime.state, actionDay);
      if (hasSelfDestruct(round as unknown as ReducerRound) && step.config.actionType === 'day_vote'
        && Number((round as { selfDestruct?: { day?: number } }).selfDestruct?.day) === Number(step.config.day)) {
        return skipAction(match, step, runtime);
      }
      if (step.config.actionType?.startsWith('sheriff_') && shouldSkipSheriffAction(runtime as unknown as ReducerRuntime, round as unknown as ReducerRound, step.config.actionType)) {
        return skipAction(match, step, runtime);
      }
      if (step.config.actionType === 'witch_save' || step.config.actionType === 'witch_poison') {
        const eligibility = getWitchActionEligibility(
          runtime as unknown as ReducerRuntime,
          round as unknown as ReducerRound,
          step.config.actionType,
        );
        if (eligibility.skipReason) {
          return skipAction(match, step, runtime, {
            reason: eligibility.skipReason,
            systemOnly: true,
          });
        }
      }
      const actors = getActorsForStep(runtime as unknown as ReducerRuntime, step as unknown as ReducerStep, round as unknown as ReducerRound);
      if (!actors.length) return skipAction(match, step, runtime);

      if (!hasOpenWork(match.id, step.id, step.config.actionType)) {
        return openActionWindow({ match, step, state, runtime, round, actors });
      }

      const eligibleActorIds = new Set(actors.map((actor) => Number(actor.id)));
      const partialResults = (collectActionResults(
        match.id,
        step.id,
        step.config.actionType!,
      ) as unknown as ReducerActionResult[]).filter((result) => (
        eligibleActorIds.has(Number(result.actorId))
      ));
      const partialApplied = shouldApplyPartialResults(step) && partialResults.length > 0;
      if (partialApplied) {
        applyActionResults(runtime as unknown as ReducerRuntime, step as unknown as ReducerStep, partialResults);
        // 放逐投票：每次投票后实时推送游戏状态到 C 端，使投票信息逐步展示
        if (step.config.actionType === 'day_vote') {
          publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
            builder.setStep(step.id).setPhase('day').setDay(step.config.day || 1);
            return builder.build('vote-update', {
              votes: (round as Record<string, unknown>).votes || {},
              voteTally: (round as Record<string, unknown>).voteTally || {},
            });
          }, serializeWerewolfState(match, syncRuntimeState(runtime) as unknown as Record<string, unknown>));
        }
        if (step.config.actionType === 'mvp_vote') {
          publishMvpVotes(match, step, runtime, partialResults, state);
        }
        if (hasSelfDestruct(round as unknown as ReducerRound)) {
          applySelfDestruct(runtime as unknown as ReducerRuntime, round as unknown as ReducerRound);
          return completeSelfDestructWindow({ match, step, runtime, round, state });
        }
      }

      if (partialResults.length < actors.length) {
        return waitForActionWindow({ match, step, state: partialApplied ? { ...syncRuntimeState(runtime), currentStep: step.id, currentActionWindow: state.currentActionWindow } : state, round, actors });
      }

      const shouldUseEngineBridge = !partialApplied && canUseWerewolfActionEngineBridge(step.config.actionType);
      const engineBridgeResult = shouldUseEngineBridge
        ? runWerewolfActionEngineBridge({
            match,
            step,
            state: state as unknown as Record<string, unknown>,
            actionWindow: state.currentActionWindow as Record<string, unknown> | null | undefined,
            results: partialResults,
          })
        : null;

      let actionState = engineBridgeResult?.state || null;
      if (!partialApplied && !engineBridgeResult) {
        applyActionResults(runtime as unknown as ReducerRuntime, step as unknown as ReducerStep, partialResults);
        actionState = syncRuntimeState(runtime) as unknown as Record<string, unknown>;
      }
      if (!actionState) actionState = syncRuntimeState(runtime) as unknown as Record<string, unknown>;
      for (const result of partialResults) {
        recordWerewolfInteractionFeedback({
          matchId: match.id,
          actionType: step.config.actionType,
          actorId: result.actorId,
          payload: result.payload as Record<string, unknown>,
          round: round as Record<string, unknown>,
          day: step.config.day,
          phase: step.config.phase,
        });
      }
      const nextState = markStepComplete({ ...actionState, currentStep: step.id, currentActionWindow: null }, step.id);
      resolveActionWindow(match.id, step.id, step.config.actionType!, state.currentActionWindow as unknown as ActionWindow);
      const resolvedChannel = resolveActionChannel(step.config.actionType || '');
      const completedEvents: unknown[] = [createWerewolfEvent(match, step, nextState as unknown as Record<string, unknown>, 'werewolf_action_submitted', actionResolvedMessage(step.config.actionType, step.config.day), { actionType: step.config.actionType }, resolvedChannel)];
      if (engineBridgeResult?.audit) {
        completedEvents.push(createActionEngineShadowAuditEvent(match, step, nextState as unknown as Record<string, unknown>, engineBridgeResult.audit));
      }

      // 添加阶段结果和阶段结束事件（预言家、女巫、守卫等）
      if (hasActionPhase(step.config.actionType || '')) {
        const phaseConfig = getActionPhaseConfig(step.config.actionType!);
        const completedRound = getRoundFromState(nextState as Record<string, unknown>, step.config.day || 1) || round;
        const phaseContext = buildPhaseContext(step.config.actionType!, partialResults, completedRound);
        const phaseMessages = phaseConfig?.buildMessages(step.config.day || 1, phaseContext);
        publishScopedPhaseResultEvent(
          match,
          runtime,
          step,
          nextState as Record<string, unknown>,
          phaseMessages?.result || actionResolvedMessage(step.config.actionType, step.config.day),
          phaseContext,
          resolvedChannel,
        );

        // 阶段结果事件
        if (phaseMessages?.result) {
          completedEvents.push(createWerewolfEvent(
            match,
            step,
            nextState as unknown as Record<string, unknown>,
            'werewolf_phase_result',
            phaseMessages.result,
            { actionType: step.config.actionType, ...phaseContext },
            resolvedChannel
          ));
        }

        // 阶段结束事件（请闭眼）- 只在消息非空时生成
        const endMessage = phaseMessages ? phaseMessages.end : phaseEndMessage(step.config.actionType, step.config.day);
        if (endMessage) {
          completedEvents.push(createWerewolfEvent(
            match,
            step,
            nextState as unknown as Record<string, unknown>,
            'werewolf_phase_end',
            endMessage,
            { actionType: step.config.actionType },
            { channel: CHANNEL_TYPES.PUBLIC }
          ));
        }
      }

      // Phase 4: 双写 phase-end 到 EventBus（如果有阶段结束）
      if (hasActionPhase(step.config.actionType || '')) {
        const endMsg = (() => {
          const pc = getActionPhaseConfig(step.config.actionType!);
          const completedRound = getRoundFromState(nextState as Record<string, unknown>, step.config.day || 1) || round;
          const pctx = buildPhaseContext(step.config.actionType!, partialResults, completedRound);
          const pmsgs = pc?.buildMessages(step.config.day || 1, pctx);
          return pmsgs ? pmsgs.end : phaseEndMessage(step.config.actionType, step.config.day);
        })();
        if (endMsg) {
          publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
            builder.setStep(step.id);
            builder.setPhase((step.config.phase as 'night' | 'day') || 'night');
            builder.setDay(step.config.day || 1);
            return builder.build('phase-end', {
              phase: step.config.phase || 'night',
              actionType: step.config.actionType,
              message: endMsg,
            });
          });
        }
      }

      return {
        status: 'COMPLETED',
        state: nextState,
        events: completedEvents
      };
    },
    runAiTask: runActionWindowAiTask,
    validateAiResult: validateActionWindowAiResult
  };
}

function shouldApplyPartialResults(step: Step): boolean {
  return Boolean(step.config.ordered && (
    step.config.actionType === 'wolf_speech'
    || step.config.actionType === 'escape_hunter_speech'
    || step.config.actionType === 'day_speech'
    || step.config.actionType === 'day_vote'
    || step.config.actionType === 'mvp_vote'
    || step.config.actionType === 'postgame_speech'
  ));
}

function completeSelfDestructWindow({ match, step, runtime, round, state }: {
  match: Match;
  step: Step;
  runtime: Runtime;
  round: Record<string, unknown>;
  state: StepState;
}): HandlerResult {
  const nextState = markStepComplete({
    ...syncRuntimeState(runtime),
    currentStep: step.id,
    currentActionWindow: null,
  }, step.id);
  resolveActionWindow(match.id, step.id, step.config.actionType!, state.currentActionWindow as unknown as ActionWindow);
  const selfDestruct = (round as { selfDestruct?: Record<string, unknown> }).selfDestruct || {};
  const actorId = Number(selfDestruct.playerId || 0);
  const targetId = Number(selfDestruct.targetId || 0) || null;
  const text = String(selfDestruct.text || `${actorId ? getSeatNumber(actorId, runtime.agents) : '狼人'}号狼人自爆。`);

  // Phase 4: 双写 self-destruct 到 EventBus
  publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
    builder.setStep(step.id);
    builder.setPhase('day');
    builder.setDay(step.config.day || 1);
    return builder.buildSelfDestruct({ playerId: actorId, text, targetId });
  });

  const events: unknown[] = [createWerewolfEvent(
    match,
    step,
    nextState as unknown as Record<string, unknown>,
    'werewolf_self_destruct',
    `狼人自爆：${getSeatNumber(actorId, runtime.agents)}号玩家出局，白天流程中止。`,
    {
      actionType: 'self_destruct',
      actorId,
      targetId,
      selfDestruct,
      speech: { playerId: actorId, text, phase: 'day', day: step.config.day }
    },
    { channel: CHANNEL_TYPES.PUBLIC }
  )];
  return {
    status: 'COMPLETED',
    state: nextState,
    events,
    nextStepId: `self_destruct_resolve_${step.config.day || 1}`,
  };
}

function resolveActionDay(state: StepState, step: Step): number {
  if (step.config.day) return step.config.day;
  const rounds = Array.isArray(state.rounds) ? state.rounds as Array<{ day?: unknown }> : [];
  return Math.max(1, ...rounds.map((round) => Number(round.day) || 0));
}

function publishMvpVotes(
  match: Match,
  step: Step,
  runtime: Runtime,
  results: ReducerActionResult[],
  previousState: StepState,
): void {
  const previousVotes = (previousState.mvpVotes || {}) as Record<string, unknown>;
  const newVotes = results.filter((result) => previousVotes[String(result.actorId)] === undefined);
  for (const result of newVotes) {
    const targetId = Number(result.payload.target);
    if (!targetId || targetId === Number(result.actorId)) continue;
    const message = `${getSeatNumber(result.actorId, runtime.agents)}号投给${getSeatNumber(targetId, runtime.agents)}号`;
    publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
      builder.setStep(step.id).setPhase('postgame').setDay(resolveActionDay(runtime.state as StepState, step));
      return builder.build('mvp-vote', {
        voterId: result.actorId,
        targetId,
        message,
      }, CHANNEL_TYPES.PUBLIC, undefined, { actionType: 'mvp_vote', message });
    }, serializeWerewolfState(match, syncRuntimeState(runtime) as unknown as Record<string, unknown>));
  }
}

function createActionEngineShadowAuditEvent(
  match: Match,
  step: Step,
  state: Record<string, unknown>,
  audit: WerewolfActionEngineShadowAudit,
): unknown {
  return {
    ...createWerewolfEvent(
      match,
      step,
      state,
      'werewolf_action_engine_shadow_audited',
      'action engine shadow audit',
      {
        day: audit.day,
        actionType: audit.actionType,
        status: audit.status,
        legacy: audit.legacy,
        engine: audit.engine,
        mismatches: audit.mismatches,
        error: audit.error,
      },
      { channel: CHANNEL_TYPES.SYSTEM },
    ),
    visibility: 'system',
  };
}

function skipAction(
  match: Match,
  step: Step,
  runtime: Runtime,
  options: { reason?: string; systemOnly?: boolean } = {},
): HandlerResult {
  const nextState = markStepComplete({ ...syncRuntimeState(runtime), currentStep: step.id }, step.id);
  const skipReason = options.reason || 'no_actors_or_condition';
  if (options.systemOnly) {
    publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
      builder.setStep(step.id);
      builder.setPhase((step.config.phase as 'night' | 'day' | 'postgame') || 'night');
      builder.setDay(step.config.day || 1);
      return builder.build('action-skipped', {
        actionType: step.config.actionType,
        skipReason,
      }, CHANNEL_TYPES.SYSTEM);
    });
    return {
      status: 'COMPLETED',
      state: nextState,
      events: [{
        ...createWerewolfEvent(
          match,
          step,
          nextState as unknown as Record<string, unknown>,
          'werewolf_action_skipped',
          actionSkippedMessage(step.config.actionType, step.config.day),
          { actionType: step.config.actionType, skipReason },
          { channel: CHANNEL_TYPES.SYSTEM },
        ),
        visibility: 'system',
      }],
    };
  }
  const { channel, scopeKey } = resolveActionChannel(step.config.actionType || '');

  // Phase 4: 双写 action-skipped 到 EventBus
  publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
    builder.setStep(step.id);
    builder.setPhase((step.config.phase as 'night' | 'day' | 'postgame') || 'night');
    builder.setDay(step.config.day || 1);
    return builder.build('action-skipped', {
      actionType: step.config.actionType,
      skipReason,
    }, channel, scopeKey);
  });

  return {
    status: 'COMPLETED',
    state: nextState,
    events: [createWerewolfEvent(match, step, nextState as unknown as Record<string, unknown>, 'werewolf_action_skipped', actionSkippedMessage(step.config.actionType, step.config.day), { actionType: step.config.actionType, skipReason }, { channel, scopeKey })]
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
  const { channel, scopeKey } = resolveActionChannel(step.config.actionType || '');
  const events: unknown[] = [createWerewolfEvent(match, step, nextState as unknown as Record<string, unknown>, 'werewolf_action_requested', actionRequestedMessage(step.config.actionType, step.config.day), { actionType: step.config.actionType, actionWindow: cloneActionWindow(window) }, { channel, scopeKey })];

  // Phase 4: 双写 action-requested 到 EventBus
  publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
    builder.setStep(step.id);
    builder.setPhase((step.config.phase as 'night' | 'day' | 'postgame') || 'night');
    builder.setDay(step.config.day || 1);
    return builder.buildActionRequested(
      step.config.actionType || '',
      (actors as Array<{ id: number }>).map(a => a.id),
      { actionWindow: cloneActionWindow(window), channel, scopeKey },
    );
  });

  // 警长类行动：发布 sheriff-start 事件供 C 端展示举手图标
  if (step.config.actionType?.startsWith('sheriff_') && step.config.actionType !== 'sheriff_speech_direction') {
    publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
      builder.setStep(step.id);
      builder.setPhase('day');
      builder.setDay(step.config.day || 1);
      return builder.buildSheriffEvent('sheriff-start', {
        election: (round as { sheriffElection?: Record<string, unknown> }).sheriffElection || {},
        message: actionRequestedMessage(step.config.actionType, step.config.day),
      });
    });
  }

  // 夜晚行动：发布角色睁眼事件供 C 端展示睁眼效果
  if (step.config.phase === 'night') {
    const wakeMessage = phaseStartMessage(step.config.actionType, step.config.day);
    if (step.config.actionType === 'wolf_speech' || step.config.actionType === 'wolf_vote' || step.config.actionType === 'wolf_kill') {
      publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
        builder.setStep(step.id).setPhase('night').setDay(step.config.day || 1);
        return builder.buildWolfWake(wakeMessage);
      });
    } else if (step.config.actionType === 'seer_check') {
      publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
        builder.setStep(step.id).setPhase('night').setDay(step.config.day || 1);
        return builder.buildSeerWake(wakeMessage);
      });
    } else if (step.config.actionType === 'guard_protect') {
      publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
        builder.setStep(step.id).setPhase('night').setDay(step.config.day || 1);
        return builder.buildGuardWake(wakeMessage);
      });
    } else if (step.config.actionType === 'witch_save') {
      const wolfTarget = (round as { night?: { wolfTarget?: number | null } }).night?.wolfTarget;
      const saveMessage = wolfTarget
        ? `女巫请睁眼，今晚${getSeatNumber(wolfTarget, runtime.agents)}号玩家死亡，你有一瓶解药，你要用吗？`
        : wakeMessage;
      publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
        builder.setStep(step.id).setPhase('night').setDay(step.config.day || 1);
        return builder.buildWitchAntidote(saveMessage);
      });
    } else if (step.config.actionType === 'witch_poison') {
      publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
        builder.setStep(step.id).setPhase('night').setDay(step.config.day || 1);
        return builder.buildWitchPoison(wakeMessage);
      });
    } else if (step.config.actionType === 'hybrid_choose_master' || step.config.actionType === 'elder_silence') {
      const { channel, scopeKey } = resolveActionChannel(step.config.actionType);
      publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
        builder.setStep(step.id).setPhase('night').setDay(step.config.day || 1);
        return builder.build('phase-start', {
          phase: 'night',
          actionType: step.config.actionType,
          message: wakeMessage,
        }, channel, scopeKey, { actionType: step.config.actionType, message: wakeMessage });
      });
    }
  }

  // 添加阶段开始事件（预言家、女巫、守卫等）
  if (hasActionPhase(step.config.actionType || '')) {
    // 白天发言：根据发言顺序生成动态播报，而非固定"请开始发言"
    const phaseStartMsg = step.config.actionType === 'day_speech'
      ? buildDaySpeechOrderAnnouncement(round) || phaseStartMessage(step.config.actionType, step.config.day)
      : phaseStartMessage(step.config.actionType, step.config.day);

    events.push(createWerewolfEvent(
      match,
      step,
      nextState as unknown as Record<string, unknown>,
      'werewolf_phase_start',
      phaseStartMsg,
      { actionType: step.config.actionType },
      { channel: CHANNEL_TYPES.PUBLIC }
    ));

    // Phase 4: 双写 phase-start 到 EventBus（已有独立 wake 事件的夜晚行动跳过，避免双重播报）
    const hasDedicatedWake = step.config.phase === 'night' && NIGHT_WAKE_ACTIONS.has(step.config.actionType || '');
    if (!hasDedicatedWake) {
      publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
        builder.setStep(step.id);
        builder.setPhase((step.config.phase as 'night' | 'day' | 'postgame') || 'night');
        builder.setDay(step.config.day || 1);
        return builder.build('phase-start', {
          phase: step.config.phase || 'night',
          actionType: step.config.actionType,
          message: phaseStartMsg,
        });
      });
    }
  }

  return {
    status: 'WAITING',
    state: nextState,
    blockers: work.blockers,
    tasks: work.tasks,
    pendingActions: work.pendingActions,
    events
  };
}

function buildPhaseContext(actionType: string, results: ReducerActionResult[], round: Record<string, unknown>): Record<string, unknown> {
  const night = (round as { night?: Record<string, unknown> }).night || {};
  const context: Record<string, unknown> = {};

  if (actionType === 'wolf_vote') {
    context.wolfTarget = night.wolfTarget || null;
    context.wolfChoices = night.wolfChoices || {};
    context.wolfVoteTally = night.wolfVoteTally || {};
  }

  if (actionType === 'seer_check' && results.length > 0) {
    const result = results[0];
    context.actorId = result.actorId;
    const seerCheck = night.seerCheck && typeof night.seerCheck === 'object'
      ? night.seerCheck as Record<string, unknown>
      : {};
    context.seerResult = seerCheck.result || result?.payload?.result || result?.payload?.faction || '未知';
    context.target = seerCheck.target || result?.payload?.target;
    const normalizedReason = normalizeReason(result?.payload?.reason);
    context.seerCheck = {
      target: context.target,
      result: context.seerResult,
      reason: normalizedReason,
    };
    context.reason = normalizedReason;
  }

  if (actionType === 'escape_hunter_speech') {
    context.escapeHunterSpeeches = night.escapeHunterSpeeches || [];
  }

  if (actionType === 'escape_hunter_vote') {
    context.escapeHunterTarget = night.escapeHunterTarget || null;
    context.escapeHunterChoices = night.escapeHunterChoices || {};
    context.escapeHunterVoteTally = night.escapeHunterVoteTally || {};
  }

  if (actionType === 'witch_save') {
    context.actorId = results[0]?.actorId;
    context.wolfTarget = night.wolfTarget || null;
    context.witchSaveUsed = results.length > 0 && results[0]?.payload?.use === true;
    context.target = context.witchSaveUsed
      ? night.witchSaveTarget || night.wolfTarget || null
      : null;
    context.reason = context.witchSaveUsed
      ? normalizeReason(results[0]?.payload?.reason)
      : null;
    context.witchAction = {
      use: context.witchSaveUsed,
      target: context.target,
      reason: context.reason,
    };
  }

  if (actionType === 'witch_poison') {
    const payload = results[0]?.payload;
    context.actorId = results[0]?.actorId;
    context.witchPoisonUsed = payload?.use === true;
    context.target = payload?.use === true ? payload?.target || null : null;
    context.reason = context.witchPoisonUsed ? normalizeReason(payload?.reason) : null;
    context.witchAction = {
      use: context.witchPoisonUsed,
      target: context.target,
      reason: context.reason,
    };
  }

  if (actionType === 'guard_protect') {
    context.guardTarget = results.length > 0 ? results[0]?.payload?.target : null;
    context.target = context.guardTarget;
    context.reason = context.guardTarget
      ? normalizeReason(results[0]?.payload?.reason)
      : null;
    context.guardAction = {
      target: context.guardTarget,
      reason: context.reason,
    };
  }

  if (actionType === 'hybrid_choose_master') {
    context.actorId = results[0]?.actorId;
    const masterId = results[0]?.payload?.target || results[0]?.payload?.targetSeat || null;
    context.hybridMasterId = masterId;
    context.target = masterId;
    context.hybridMaster = { actorId: context.actorId, masterId };
  }

  if (actionType === 'elder_silence') {
    context.actorId = results[0]?.actorId;
    const silencedPlayerId = (round as { silencedPlayerId?: unknown }).silencedPlayerId || results[0]?.payload?.target || null;
    context.silencedPlayerId = silencedPlayerId;
    context.target = silencedPlayerId;
    context.reason = silencedPlayerId ? normalizeReason(results[0]?.payload?.reason) : null;
  }

  if (actionType === 'butterfly_hug') {
    context.actorId = results[0]?.actorId;
    const targetId = (night as { butterflyTarget?: unknown }).butterflyTarget || results[0]?.payload?.target || null;
    context.butterflyTarget = targetId;
    context.target = targetId;
    context.reason = targetId ? normalizeReason(results[0]?.payload?.reason) : null;
  }

  if (actionType === 'stalker_assassinate') {
    context.actorId = results[0]?.actorId;
    const targetId = (night as { stalkerTarget?: unknown }).stalkerTarget || results[0]?.payload?.target || null;
    context.stalkerTarget = targetId;
    context.target = targetId;
    context.reason = targetId ? normalizeReason(results[0]?.payload?.reason) : null;
  }

  if (actionType === 'wolf_beauty_charm') {
    context.actorId = results[0]?.actorId;
    const targetId = (night as { wolfBeautyTarget?: unknown }).wolfBeautyTarget || results[0]?.payload?.target || null;
    context.wolfBeautyTarget = targetId;
    context.target = targetId;
    context.reason = targetId ? normalizeReason(results[0]?.payload?.reason) : null;
  }

  if (actionType === 'demon_inspect') {
    context.actorId = results[0]?.actorId;
    context.demonInspect = (night as { demonInspect?: unknown }).demonInspect || null;
    context.target = (context.demonInspect as { target?: unknown } | null)?.target || results[0]?.payload?.target || null;
  }

  if (actionType === 'nightmare_fear') {
    context.actorId = results[0]?.actorId;
    const targetId = (night as { nightmareTarget?: unknown }).nightmareTarget || results[0]?.payload?.target || null;
    context.nightmareTarget = targetId;
    context.target = targetId;
    context.reason = targetId ? normalizeReason(results[0]?.payload?.reason) : null;
  }

  if (actionType === 'penguin_freeze') {
    context.actorId = results[0]?.actorId;
    const targetId = (night as { penguinFrozenId?: unknown }).penguinFrozenId || results[0]?.payload?.target || null;
    context.penguinFrozenId = targetId;
    context.target = targetId;
    context.reason = targetId ? normalizeReason((night as { penguinReason?: unknown }).penguinReason || results[0]?.payload?.reason) : null;
  }

  if (actionType === 'fox_inspect') {
    context.actorId = results[0]?.actorId;
    const foxInspect = (night as { foxInspect?: unknown }).foxInspect as { targetIds?: unknown[]; hasWolf?: unknown; reason?: unknown } | null | undefined;
    context.foxInspect = foxInspect || null;
    context.target = foxInspect?.targetIds?.[0] || results[0]?.payload?.target || null;
    context.reason = foxInspect?.reason ? normalizeReason(foxInspect.reason) : normalizeReason(results[0]?.payload?.reason);
  }

  if (actionType === 'dreamer_dream') {
    context.actorId = results[0]?.actorId;
    const targetId = (night as { dreamerTarget?: unknown }).dreamerTarget || results[0]?.payload?.target || null;
    context.dreamerTarget = targetId;
    context.target = targetId;
    context.reason = targetId ? normalizeReason(results[0]?.payload?.reason) : null;
  }

  if (actionType === 'magician_swap') {
    context.actorId = results[0]?.actorId;
    const swap = (night as { magicianSwap?: unknown }).magicianSwap as { firstTarget?: unknown; secondTarget?: unknown; reason?: unknown } | null | undefined;
    context.magicianSwap = swap || null;
    context.target = swap?.firstTarget || results[0]?.payload?.target || null;
    context.secondTarget = swap?.secondTarget || results[0]?.payload?.secondTarget || null;
    context.reason = swap?.reason ? normalizeReason(swap.reason) : normalizeReason(results[0]?.payload?.reason);
  }

  if (actionType === 'fortune_teller_mark') {
    context.actorId = results[0]?.actorId;
    const mark = (night as { fortuneTellerMark?: unknown }).fortuneTellerMark as { target?: unknown; reason?: unknown } | null | undefined;
    context.fortuneTellerMark = mark || null;
    context.target = mark?.target || results[0]?.payload?.target || null;
    context.reason = mark?.reason ? normalizeReason(mark.reason) : normalizeReason(results[0]?.payload?.reason);
  }

  if (actionType === 'big_bad_wolf_kill') {
    context.actorId = results[0]?.actorId;
    const targetId = (night as { bigBadWolfTarget?: unknown }).bigBadWolfTarget || results[0]?.payload?.target || null;
    context.bigBadWolfTarget = targetId;
    context.target = targetId;
    context.reason = targetId ? normalizeReason((night as { bigBadWolfReason?: unknown }).bigBadWolfReason || results[0]?.payload?.reason) : null;
  }

  if (actionType === 'crow_curse') {
    context.actorId = results[0]?.actorId;
    const curse = (night as { crowCurse?: unknown }).crowCurse as { target?: unknown; reason?: unknown } | null | undefined;
    context.crowCurse = curse || null;
    context.target = curse?.target || results[0]?.payload?.target || null;
    context.reason = curse?.reason ? normalizeReason(curse.reason) : normalizeReason(results[0]?.payload?.reason);
  }

  if (actionType === 'black_merchant_gift') {
    context.actorId = results[0]?.actorId;
    const gift = (night as { blackMerchantGift?: unknown }).blackMerchantGift as { targetId?: unknown; gift?: unknown; success?: unknown; reason?: unknown } | null | undefined;
    context.blackMerchantGift = gift || null;
    context.target = gift?.targetId || results[0]?.payload?.target || null;
    context.reason = gift?.reason ? normalizeReason(gift.reason) : normalizeReason(results[0]?.payload?.reason);
  }

  if (actionType === 'lucky_seer_check') {
    context.actorId = results[0]?.actorId;
    const check = (night as { luckySeerCheck?: unknown }).luckySeerCheck as { target?: unknown; result?: unknown; reason?: unknown } | null | undefined;
    context.luckySeerCheck = check || null;
    context.target = check?.target || results[0]?.payload?.target || null;
    context.reason = check?.reason ? normalizeReason(check.reason) : normalizeReason(results[0]?.payload?.reason);
  }

  if (actionType === 'lucky_witch_poison') {
    context.actorId = results[0]?.actorId;
    context.luckyPoisonTarget = (night as { luckyPoisonTarget?: unknown }).luckyPoisonTarget || results[0]?.payload?.target || null;
    context.target = context.luckyPoisonTarget;
    context.reason = normalizeReason((night as { luckyPoisonReason?: unknown }).luckyPoisonReason || results[0]?.payload?.reason);
  }

  if (actionType === 'younger_brother_kill') {
    context.actorId = results[0]?.actorId;
    context.youngerBrotherTarget = (night as { youngerBrotherTarget?: unknown }).youngerBrotherTarget || results[0]?.payload?.target || null;
    context.target = context.youngerBrotherTarget;
    context.reason = normalizeReason((night as { youngerBrotherReason?: unknown }).youngerBrotherReason || results[0]?.payload?.reason);
  }

  if (actionType === 'ghost_bride_link') {
    context.actorId = results[0]?.actorId;
    const link = (night as { ghostBrideLink?: unknown }).ghostBrideLink as { partnerId?: unknown; witnessId?: unknown; reason?: unknown } | null | undefined;
    context.ghostBrideLink = link || null;
    context.target = link?.partnerId || results[0]?.payload?.target || null;
    context.reason = link?.reason ? normalizeReason(link.reason) : normalizeReason(results[0]?.payload?.reason);
  }

  if (actionType === 'ghost_bride_chat') {
    context.actorId = results[0]?.actorId;
    context.ghostBrideChat = (night as { ghostBrideChat?: unknown }).ghostBrideChat || [];
  }

  if (actionType === 'ghost_bride_kill') {
    context.actorId = results[0]?.actorId;
    context.ghostBrideTarget = (night as { ghostBrideTarget?: unknown }).ghostBrideTarget || results[0]?.payload?.target || null;
    context.target = context.ghostBrideTarget;
    context.reason = normalizeReason((night as { ghostBrideReason?: unknown }).ghostBrideReason || results[0]?.payload?.reason);
  }

  if (actionType === 'demon_hunter_hunt') {
    context.actorId = results[0]?.actorId;
    context.demonHunterTarget = (night as { demonHunterTarget?: unknown }).demonHunterTarget || results[0]?.payload?.target || null;
    context.target = context.demonHunterTarget;
    context.reason = normalizeReason((night as { demonHunterReason?: unknown }).demonHunterReason || results[0]?.payload?.reason);
  }

  if (actionType === 'spirit_wolf_learn') {
    context.actorId = results[0]?.actorId;
    context.spiritWolfLearn = (night as { spiritWolfLearn?: unknown }).spiritWolfLearn || null;
    context.target = (context.spiritWolfLearn as { targetId?: unknown } | null)?.targetId || results[0]?.payload?.target || null;
    context.reason = normalizeReason((context.spiritWolfLearn as { reason?: unknown } | null)?.reason || results[0]?.payload?.reason);
  }

  if (actionType === 'spirit_wolf_inspect') {
    context.actorId = results[0]?.actorId;
    context.spiritWolfInspect = (night as { spiritWolfInspect?: unknown }).spiritWolfInspect || null;
    context.target = (context.spiritWolfInspect as { target?: unknown } | null)?.target || results[0]?.payload?.target || null;
    context.reason = normalizeReason((context.spiritWolfInspect as { reason?: unknown } | null)?.reason || results[0]?.payload?.reason);
  }

  if (actionType === 'spirit_wolf_guard') {
    context.actorId = results[0]?.actorId;
    context.spiritWolfGuardTarget = (night as { spiritWolfGuardTarget?: unknown }).spiritWolfGuardTarget || results[0]?.payload?.target || null;
    context.target = context.spiritWolfGuardTarget;
    context.reason = normalizeReason((night as { spiritWolfGuardReason?: unknown }).spiritWolfGuardReason || results[0]?.payload?.reason);
  }

  if (actionType === 'spirit_wolf_antidote') {
    context.actorId = results[0]?.actorId;
    context.spiritWolfAntidoteTarget = (night as { spiritWolfAntidoteTarget?: unknown }).spiritWolfAntidoteTarget || results[0]?.payload?.target || null;
    context.target = context.spiritWolfAntidoteTarget;
    context.reason = normalizeReason((night as { spiritWolfAntidoteReason?: unknown }).spiritWolfAntidoteReason || results[0]?.payload?.reason);
  }

  if (actionType === 'wolf_witch_curse') {
    context.actorId = results[0]?.actorId;
    context.wolfWitchCurse = (night as { wolfWitchCurse?: unknown }).wolfWitchCurse || null;
    context.target = (context.wolfWitchCurse as { targetId?: unknown } | null)?.targetId || results[0]?.payload?.target || null;
    context.reason = normalizeReason((context.wolfWitchCurse as { reason?: unknown } | null)?.reason || results[0]?.payload?.reason);
  }

  if (actionType === 'illusionist_illusion') {
    context.actorId = results[0]?.actorId;
    context.illusionTarget = (night as { illusionTarget?: unknown }).illusionTarget || results[0]?.payload?.target || null;
    context.target = context.illusionTarget;
    context.reason = normalizeReason((night as { illusionReason?: unknown }).illusionReason || results[0]?.payload?.reason);
  }

  if (actionType === 'bear_tamer_roar') {
    context.actorId = results[0]?.actorId;
    context.bearRoar = (round as { bearRoar?: unknown }).bearRoar || {
      roaring: Boolean(results[0]?.payload?.roaring),
      adjacentWolfIds: results[0]?.payload?.adjacentWolfIds || [],
    };
  }

  if (actionType === 'knight_duel') {
    context.actorId = results[0]?.actorId;
    context.knightDuel = (round as { knightDuel?: unknown }).knightDuel || null;
    context.target = (context.knightDuel as { targetId?: unknown } | null)?.targetId || results[0]?.payload?.target || null;
  }

  return context;
}

function publishScopedPhaseResultEvent(
  match: Match,
  runtime: Runtime,
  step: Step,
  state: Record<string, unknown>,
  message: string,
  phaseContext: Record<string, unknown>,
  channelInfo: ReturnType<typeof resolveActionChannel>,
): void {
  const eventType = step.config.actionType === 'escape_hunter_speech'
    ? 'escape-hunter-speech'
    : step.config.actionType === 'escape_hunter_vote'
      ? 'escape-hunter-vote'
      : step.config.actionType === 'wolf_vote'
    ? 'wolf-vote'
    : step.config.actionType === 'seer_check'
      ? 'seer-check'
      : step.config.actionType === 'guard_protect'
        ? 'guard-action'
        : step.config.actionType === 'witch_save' || step.config.actionType === 'witch_poison'
          ? 'witch-action'
          : step.config.actionType === 'hybrid_choose_master'
            ? 'hybrid-master'
            : step.config.actionType === 'elder_silence'
              ? 'silence-result'
              : step.config.actionType === 'knight_duel'
                ? 'knight-duel'
                : step.config.actionType === 'butterfly_hug'
                  ? 'butterfly-hug'
                  : step.config.actionType === 'stalker_assassinate'
                    ? 'stalker-assassinate'
                    : step.config.actionType === 'wolf_beauty_charm'
                      ? 'wolf-beauty-charm'
                      : step.config.actionType === 'demon_inspect'
                        ? 'demon-inspect'
                        : step.config.actionType === 'nightmare_fear'
                          ? 'nightmare-fear'
                          : step.config.actionType === 'dreamer_dream'
                            ? 'dreamer-dream'
                            : step.config.actionType === 'magician_swap'
                              ? 'magician-swap'
                              : step.config.actionType === 'fortune_teller_mark'
                                ? 'fortune-teller-mark'
                                : step.config.actionType === 'big_bad_wolf_kill'
                                  ? 'big-bad-wolf-kill'
                                  : step.config.actionType === 'crow_curse'
                                    ? 'crow-curse'
                                    : step.config.actionType === 'black_merchant_gift'
                                      ? 'black-merchant-gift'
                                      : step.config.actionType === 'lucky_seer_check'
                                        ? 'lucky-seer-check'
                                        : step.config.actionType === 'lucky_witch_poison'
                                          ? 'lucky-witch-poison'
                                          : step.config.actionType === 'younger_brother_kill'
                                            ? 'younger-brother-kill'
                                            : step.config.actionType === 'ghost_bride_link'
                                              ? 'ghost-bride-link'
                                              : step.config.actionType === 'ghost_bride_chat'
                                                ? 'ghost-bride-chat'
                                                : step.config.actionType === 'ghost_bride_kill'
                                                  ? 'ghost-bride-kill'
                                                  : step.config.actionType === 'demon_hunter_hunt'
                                                    ? 'demon-hunter-hunt'
                                                    : step.config.actionType === 'spirit_wolf_learn'
                                                      ? 'spirit-wolf-learn'
                                                      : step.config.actionType === 'spirit_wolf_inspect'
                                                        ? 'spirit-wolf-inspect'
                                                        : step.config.actionType === 'spirit_wolf_guard'
                                                          ? 'spirit-wolf-guard'
          : step.config.actionType === 'spirit_wolf_antidote'
            ? 'spirit-wolf-antidote'
            : step.config.actionType === 'wolf_witch_curse'
              ? 'wolf-witch-curse'
              : step.config.actionType === 'illusionist_illusion'
                ? 'illusionist-illusion'
                : step.config.actionType === 'penguin_freeze'
                  ? 'penguin-freeze'
                  : step.config.actionType === 'fox_inspect'
                    ? 'fox-inspect'
                    : step.config.actionType === 'bear_tamer_roar'
                      ? 'bear-tamer-roar'
                      : null;
  if (!eventType) return;
  const snapshot = serializeWerewolfState(match, state);
  const actorId = Number(phaseContext.actorId || 0);
  const shouldUsePlayerVoice = (
    eventType === 'seer-check'
    || (eventType === 'witch-action'
      && (phaseContext.witchAction as { use?: boolean } | undefined)?.use === true)
  ) && actorId > 0 && Boolean(message);
  publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
    builder.setStep(step.id);
    builder.setPhase((step.config.phase as 'night' | 'day' | 'postgame') || 'night');
    builder.setDay(step.config.day || 1);
    return builder.build(
      eventType,
      {
        phase: step.config.phase || 'night',
        actionType: step.config.actionType,
        message,
        ...phaseContext,
        ...(eventType === 'seer-check' ? { seerCheck: phaseContext.seerCheck } : {}),
        ...(eventType === 'guard-action' ? { guardAction: phaseContext.guardAction } : {}),
        ...(eventType === 'witch-action' ? { witchAction: phaseContext.witchAction } : {}),
        ...(eventType === 'hybrid-master' ? { hybridMaster: phaseContext.hybridMaster } : {}),
        ...(eventType === 'silence-result' ? { silencedPlayerId: phaseContext.silencedPlayerId } : {}),
        ...(eventType === 'knight-duel' ? { knightDuel: phaseContext.knightDuel } : {}),
        ...(eventType === 'butterfly-hug' ? { butterflyTarget: phaseContext.butterflyTarget } : {}),
        ...(eventType === 'stalker-assassinate' ? { stalkerTarget: phaseContext.stalkerTarget } : {}),
        ...(eventType === 'wolf-beauty-charm' ? { wolfBeautyTarget: phaseContext.wolfBeautyTarget } : {}),
        ...(eventType === 'demon-inspect' ? { demonInspect: phaseContext.demonInspect } : {}),
        ...(eventType === 'nightmare-fear' ? { nightmareTarget: phaseContext.nightmareTarget } : {}),
        ...(eventType === 'dreamer-dream' ? { dreamerTarget: phaseContext.dreamerTarget } : {}),
        ...(eventType === 'magician-swap' ? { magicianSwap: phaseContext.magicianSwap } : {}),
        ...(eventType === 'fortune-teller-mark' ? { fortuneTellerMark: phaseContext.fortuneTellerMark } : {}),
        ...(eventType === 'big-bad-wolf-kill' ? { bigBadWolfTarget: phaseContext.bigBadWolfTarget } : {}),
        ...(eventType === 'crow-curse' ? { crowCurse: phaseContext.crowCurse } : {}),
        ...(eventType === 'black-merchant-gift' ? { blackMerchantGift: phaseContext.blackMerchantGift } : {}),
        ...(eventType === 'lucky-seer-check' ? { luckySeerCheck: phaseContext.luckySeerCheck } : {}),
        ...(eventType === 'lucky-witch-poison' ? { luckyPoisonTarget: phaseContext.luckyPoisonTarget } : {}),
        ...(eventType === 'younger-brother-kill' ? { youngerBrotherTarget: phaseContext.youngerBrotherTarget } : {}),
        ...(eventType === 'ghost-bride-link' ? { ghostBrideLink: phaseContext.ghostBrideLink } : {}),
        ...(eventType === 'ghost-bride-chat' ? { ghostBrideChat: phaseContext.ghostBrideChat } : {}),
        ...(eventType === 'ghost-bride-kill' ? { ghostBrideTarget: phaseContext.ghostBrideTarget } : {}),
        ...(eventType === 'spirit-wolf-learn' ? { spiritWolfLearn: phaseContext.spiritWolfLearn } : {}),
        ...(eventType === 'spirit-wolf-inspect' ? { spiritWolfInspect: phaseContext.spiritWolfInspect } : {}),
        ...(eventType === 'spirit-wolf-guard' ? { spiritWolfGuardTarget: phaseContext.spiritWolfGuardTarget } : {}),
        ...(eventType === 'spirit-wolf-antidote' ? { spiritWolfAntidoteTarget: phaseContext.spiritWolfAntidoteTarget } : {}),
        ...(eventType === 'penguin-freeze' ? { penguinFrozenId: phaseContext.penguinFrozenId } : {}),
        ...(eventType === 'fox-inspect' ? { foxInspect: phaseContext.foxInspect } : {}),
        ...(eventType === 'bear-tamer-roar' ? { bearRoar: phaseContext.bearRoar } : {}),
        ...(shouldUsePlayerVoice ? { speech: { playerId: actorId, text: message } } : {}),
      },
      channelInfo.channel,
      channelInfo.scopeKey,
      { actionType: step.config.actionType, message },
    );
  }, snapshot);
}

function normalizeReason(value: unknown): string | null {
  const reason = String(value || '').trim().slice(0, 80);
  return reason || null;
}

function getRoundFromState(state: Record<string, unknown>, day: number): Record<string, unknown> | null {
  const rounds = state.rounds;
  if (!Array.isArray(rounds)) return null;
  const matchingRound = [...rounds].reverse().find((round) => (
    Boolean(round && typeof round === 'object' && Number((round as { day?: unknown }).day) === day)
  ));
  return matchingRound && typeof matchingRound === 'object'
    ? matchingRound as Record<string, unknown>
    : null;
}

function cloneActionWindow(window: ActionWindow): Record<string, unknown> {
  return {
    ...window,
    actorIds: [...(window.actorIds || [])],
    targetIds: [...(window.targetIds || [])],
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
