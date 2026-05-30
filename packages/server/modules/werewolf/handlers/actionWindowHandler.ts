import {
  buildActionWindow,
  createActionBlockers,
  hasOpenWork,
  collectActionResults,
  allActionWorkSucceeded,
  resolveActionWindow
} from '../actionWindows';
import type { ActionWindow } from '../actionWindows';
import { createRuntime, ensureRound, syncRuntimeState, serializeWerewolfState } from '../runtime';
import type { Runtime } from '../runtime';
import { applyActionResults, applySelfDestruct, getActorsForStep, getTargetIds, hasSelfDestruct } from '../reducers';
import type { ActionResult as ReducerActionResult, Runtime as ReducerRuntime, Round as ReducerRound, Step as ReducerStep } from '../reducers';
import { shouldSkipSheriffAction } from '../sheriffWorkflow';
import { ensureWolfTeamContext } from '../wolfTeam';
import { runActionWindowAiTask, validateActionWindowAiResult } from '../aiActions';
import { createWerewolfEvent, publishGameEvent, completed, isDone, markStepComplete } from './common';
import type { StepState } from './common';
import { actionRequestedMessage, actionResolvedMessage, actionSkippedMessage, phaseStartMessage, phaseResultMessage, phaseEndMessage } from '../messages';
import { hasActionPhase, getActionPhaseConfig } from '../actionPhases';
import { resolveActionChannel } from './actionChannel';
import { CHANNEL_TYPES } from '@ai-presenter/shared/types/channelTypes';

/** 已有独立睁眼事件的夜晚行动 — phase-start 不再重复发布 */
const NIGHT_WAKE_ACTIONS = new Set([
  'wolf_speech', 'wolf_vote', 'wolf_kill',
  'seer_check', 'guard_protect', 'witch_save', 'witch_poison',
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
}

function createActionWindowHandler() {
  return {
    execute({ match, step, state }: { match: Match; step: Step; state: StepState }): HandlerResult {
      if (isDone(state, step.id) || state.winner) return completed(state, step.id);
      const runtime = createRuntime(match, state);
      // Phase 4 fix: 将游戏状态快照注入 builder，使后续事件携带 game.players
      if (runtime.gameEventBuilder) {
        const snapshot = serializeWerewolfState(match, state as unknown as Record<string, unknown>);
        runtime.gameEventBuilder.setGame(snapshot as unknown as Parameters<typeof runtime.gameEventBuilder.setGame>[0]);
      }
      const round = ensureRound(runtime.state, step.config.day!);
      if (hasSelfDestruct(round as unknown as ReducerRound) && step.config.actionType === 'day_vote') {
        return skipAction(match, step, runtime);
      }
      if (step.config.actionType?.startsWith('sheriff_') && shouldSkipSheriffAction(runtime as unknown as ReducerRuntime, round as unknown as ReducerRound, step.config.actionType)) {
        return skipAction(match, step, runtime);
      }
      const actors = getActorsForStep(runtime as unknown as ReducerRuntime, step as unknown as ReducerStep, round as unknown as ReducerRound);
      if (!actors.length) return skipAction(match, step, runtime);

      if (!hasOpenWork(match.id, step.id, step.config.actionType)) {
        return openActionWindow({ match, step, state, runtime, round, actors });
      }

      const partialResults = collectActionResults(match.id, step.id, step.config.actionType!) as unknown as ReducerActionResult[];
      const partialApplied = shouldApplyPartialResults(step) && partialResults.length > 0;
      if (partialApplied) {
        applyActionResults(runtime as unknown as ReducerRuntime, step as unknown as ReducerStep, partialResults);
        if (hasSelfDestruct(round as unknown as ReducerRound)) {
          applySelfDestruct(runtime as unknown as ReducerRuntime, round as unknown as ReducerRound);
          return completeSelfDestructWindow({ match, step, runtime, round, state });
        }
      }

      if (!allActionWorkSucceeded(match.id, step.id, step.config.actionType!, actors.length)) {
        return waitForActionWindow({ match, step, state: partialApplied ? { ...syncRuntimeState(runtime), currentStep: step.id, currentActionWindow: state.currentActionWindow } : state, round, actors });
      }

      if (!partialApplied) {
        applyActionResults(runtime as unknown as ReducerRuntime, step as unknown as ReducerStep, partialResults);
      }
      const nextState = markStepComplete({ ...syncRuntimeState(runtime), currentStep: step.id, currentActionWindow: null }, step.id);
      resolveActionWindow(match.id, step.id, step.config.actionType!, state.currentActionWindow as unknown as ActionWindow);
      const resolvedChannel = resolveActionChannel(step.config.actionType || '');
      const completedEvents: unknown[] = [createWerewolfEvent(match, step, nextState as unknown as Record<string, unknown>, 'werewolf_action_submitted', actionResolvedMessage(step.config.actionType, step.config.day), { actionType: step.config.actionType }, resolvedChannel)];

      // 添加阶段结果和阶段结束事件（预言家、女巫、守卫等）
      if (hasActionPhase(step.config.actionType || '')) {
        const phaseConfig = getActionPhaseConfig(step.config.actionType!);
        const phaseContext = buildPhaseContext(step.config.actionType!, partialResults, round);
        const phaseMessages = phaseConfig?.buildMessages(step.config.day || 1, phaseContext);

        // 阶段结果事件
        if (phaseMessages?.result) {
          completedEvents.push(createWerewolfEvent(
            match,
            step,
            nextState as unknown as Record<string, unknown>,
            'werewolf_phase_result',
            phaseMessages.result,
            { actionType: step.config.actionType, ...phaseContext },
            { channel: CHANNEL_TYPES.PUBLIC }
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
          const pctx = buildPhaseContext(step.config.actionType!, partialResults, round);
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
  return Boolean(step.config.ordered && (step.config.actionType === 'wolf_speech' || step.config.actionType === 'day_speech'));
}

function completeSelfDestructWindow({ match, step, runtime, round, state }: {
  match: Match;
  step: Step;
  runtime: Runtime;
  round: Record<string, unknown>;
  state: StepState;
}): HandlerResult {
  const nextState = markStepComplete({ ...syncRuntimeState(runtime), currentStep: step.id, currentActionWindow: null }, step.id);
  resolveActionWindow(match.id, step.id, step.config.actionType!, state.currentActionWindow as unknown as ActionWindow);
  const selfDestruct = (round as { selfDestruct?: Record<string, unknown> }).selfDestruct || {};
  const actorId = Number(selfDestruct.playerId || 0);
  const text = String(selfDestruct.text || `${actorId || '狼人'}号狼人自爆。`);

  // Phase 4: 双写 self-destruct 到 EventBus
  publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
    builder.setStep(step.id);
    builder.setPhase('day');
    builder.setDay(step.config.day || 1);
    return builder.buildSelfDestruct({ playerId: actorId, text });
  });

  return {
    status: 'COMPLETED',
    state: nextState,
    events: [createWerewolfEvent(
      match,
      step,
      nextState as unknown as Record<string, unknown>,
      'werewolf_self_destruct',
      `狼人自爆：${actorId}号玩家出局，白天流程中止。`,
      {
        actionType: 'self_destruct',
        actorId,
        selfDestruct,
        speech: { playerId: actorId, text, phase: 'day', day: step.config.day }
      },
      { channel: CHANNEL_TYPES.PUBLIC }
    )]
  };
}

function skipAction(match: Match, step: Step, runtime: Runtime): HandlerResult {
  const nextState = markStepComplete({ ...syncRuntimeState(runtime), currentStep: step.id }, step.id);
  const { channel, scopeKey } = resolveActionChannel(step.config.actionType || '');

  // Phase 4: 双写 action-skipped 到 EventBus
  publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
    builder.setStep(step.id);
    builder.setPhase((step.config.phase as 'night' | 'day') || 'night');
    builder.setDay(step.config.day || 1);
    return builder.build('action-skipped', {
      actionType: step.config.actionType,
      skipReason: 'no_actors_or_condition',
    }, channel, scopeKey);
  });

  return {
    status: 'COMPLETED',
    state: nextState,
    events: [createWerewolfEvent(match, step, nextState as unknown as Record<string, unknown>, 'werewolf_action_skipped', actionSkippedMessage(step.config.actionType, step.config.day), { actionType: step.config.actionType }, { channel, scopeKey })]
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
  const events: unknown[] = [createWerewolfEvent(match, step, nextState as unknown as Record<string, unknown>, 'werewolf_action_requested', actionRequestedMessage(step.config.actionType, step.config.day), { actionType: step.config.actionType, actionWindow: window }, { channel, scopeKey })];

  // Phase 4: 双写 action-requested 到 EventBus
  publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
    builder.setStep(step.id);
    builder.setPhase((step.config.phase as 'night' | 'day') || 'night');
    builder.setDay(step.config.day || 1);
    return builder.buildActionRequested(
      step.config.actionType || '',
      (actors as Array<{ id: number }>).map(a => a.id),
      { actionWindow: window as unknown as Record<string, unknown>, channel, scopeKey },
    );
  });

  // 警长类行动：发布 sheriff-start 事件供 C 端展示举手图标
  if (step.config.actionType?.startsWith('sheriff_')) {
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
        ? `女巫请睁眼，今晚${wolfTarget}号玩家死亡，你有一瓶解药，你要用吗？`
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
    }
  }

  // 添加阶段开始事件（预言家、女巫、守卫等）
  if (hasActionPhase(step.config.actionType || '')) {
    events.push(createWerewolfEvent(
      match,
      step,
      nextState as unknown as Record<string, unknown>,
      'werewolf_phase_start',
      phaseStartMessage(step.config.actionType, step.config.day),
      { actionType: step.config.actionType },
      { channel: CHANNEL_TYPES.PUBLIC }
    ));

    // Phase 4: 双写 phase-start 到 EventBus（已有独立 wake 事件的夜晚行动跳过，避免双重播报）
    const hasDedicatedWake = step.config.phase === 'night' && NIGHT_WAKE_ACTIONS.has(step.config.actionType || '');
    if (!hasDedicatedWake) {
      publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
        builder.setStep(step.id);
        builder.setPhase((step.config.phase as 'night' | 'day') || 'night');
        builder.setDay(step.config.day || 1);
        return builder.build('phase-start', {
          phase: step.config.phase || 'night',
          actionType: step.config.actionType,
          message: phaseStartMessage(step.config.actionType, step.config.day),
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

  if (actionType === 'seer_check' && results.length > 0) {
    const result = results[0];
    context.seerResult = result?.payload?.result || result?.payload?.faction || '未知';
    context.target = result?.payload?.target;
  }

  if (actionType === 'witch_save') {
    context.wolfTarget = night.wolfTarget || null;
    context.witchSaveUsed = results.length > 0 && results[0]?.payload?.use === true;
    context.target = results.length > 0 ? results[0]?.payload?.target : null;
  }

  if (actionType === 'witch_poison') {
    context.witchPoisonUsed = results.length > 0;
    context.target = results.length > 0 ? results[0]?.payload?.target : null;
  }

  if (actionType === 'guard_protect') {
    context.guardTarget = results.length > 0 ? results[0]?.payload?.target : null;
    context.target = context.guardTarget;
  }

  return context;
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
