import { CHANNEL_TYPES } from '@ai-presenter/shared/types/channelTypes';
import { MATCH_STATUS } from '@ai-presenter/shared/types/workflowTypes';
import { createRuntime, serializeWerewolfState, syncRuntimeState } from './runtime';
import { getSeatNumber } from './utils';
import { createWerewolfEvent, isDone, markStepComplete, publishGameEvent } from './handlers/common';
import type { StepState } from './handlers/common';
import { selectWerewolfMvp } from './postgameRules';

const WEREWOLF_POSTGAME_DAYBREAK_STEP_ID = 'postgame_daybreak';

function createPostgameResetHandler() {
  return {
    async execute({ match, step, state }: { match: Match; step: Step; state: StepState }): Promise<HandlerResult> {
      if (isDone(state, step.id)) return { status: 'COMPLETED', state };
      const runtime = await createRuntime(match, state);

      // 重置所有玩家为存活状态（纯展示用途，不影响胜负结果）
      for (const agent of runtime.agents) {
        agent.alive = true;
        agent.canVote = true;
      }
      const nextState = markStepComplete({
        ...syncRuntimeState(runtime),
        currentStep: step.id,
      }, step.id);

      // 发布游戏结束事件
      publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
        builder.setStep(step.id).setPhase('day').setDay(resolveLastDay(nextState));
        return builder.build('game-end', {
          message: '游戏结束，所有玩家身份公开。',
          winner: nextState.winner,
          winReason: nextState.winReason,
        }, CHANNEL_TYPES.PUBLIC, undefined, { message: '游戏结束' });
      }, serializeWerewolfState(match, nextState as Record<string, unknown>));

      return {
        status: 'COMPLETED',
        state: nextState,
        events: [createWerewolfEvent(
          match,
          step,
          nextState as Record<string, unknown>,
          'werewolf_game_end',
          '游戏结束，所有玩家身份公开。',
          { winner: nextState.winner, winReason: nextState.winReason },
          { channel: CHANNEL_TYPES.PUBLIC },
        )],
      };
    },
  };
}

function createPostgameDaybreakHandler() {
  return {
    async execute({ match, step, state }: { match: Match; step: Step; state: StepState }): Promise<HandlerResult> {
      if (isDone(state, step.id)) return { status: 'COMPLETED', state };
      const rounds = [...((state.rounds || []) as Array<Record<string, unknown>>)];
      const lastIndex = rounds.length - 1;
      if (lastIndex >= 0) rounds[lastIndex] = { ...rounds[lastIndex], phase: 'day' };
      const nextState = markStepComplete({ ...state, rounds, currentStep: step.id }, step.id);
      const runtime = await createRuntime(match, nextState);
      publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
        builder.setStep(step.id).setPhase('day').setDay(resolveLastDay(nextState));
        return builder.build('day-start', { message: '天亮了' }, CHANNEL_TYPES.PUBLIC, undefined, { message: '天亮了' });
      }, serializeWerewolfState(match, nextState as Record<string, unknown>));
      return {
        status: 'COMPLETED',
        state: nextState,
        events: [createWerewolfEvent(match, step, nextState as Record<string, unknown>, 'werewolf_postgame_daybreak', '天亮了', {}, { channel: CHANNEL_TYPES.PUBLIC })],
      };
    },
  };
}

function createPostgameMvpIntroHandler() {
  return {
    async execute({ match, step, state }: { match: Match; step: Step; state: StepState }): Promise<HandlerResult> {
      if (isDone(state, step.id)) return { status: 'COMPLETED', state };
      const message = '现在进行MVP评选，请评选本局MVP。';
      const nextState = markStepComplete({ ...state, currentStep: step.id }, step.id);
      const runtime = await createRuntime(match, nextState);
      publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
        builder.setStep(step.id).setPhase('postgame').setDay(resolveLastDay(nextState));
        return builder.build('mvp-start', { message }, CHANNEL_TYPES.PUBLIC, undefined, { message });
      }, serializeWerewolfState(match, nextState as Record<string, unknown>));
      return {
        status: 'COMPLETED',
        state: nextState,
        events: [createWerewolfEvent(match, step, nextState as Record<string, unknown>, 'werewolf_mvp_started', message, {}, { channel: CHANNEL_TYPES.PUBLIC })],
      };
    },
  };
}

interface PlayerRecord {
  id: number;
  faction?: string;
  nickname?: string;
  name?: string;
  role?: string;
  roleLabel?: string;
  [key: string]: unknown;
}

interface Match {
  id: string;
  [key: string]: unknown;
}

interface Step {
  id: string;
  [key: string]: unknown;
}

interface HandlerResult {
  status: string;
  state: StepState;
  events?: unknown[];
  matchStatus?: string;
}

function createMvpResultHandler() {
  return {
    async execute({ match, step, state }: { match: Match; step: Step; state: StepState }): Promise<HandlerResult> {
      if (isDone(state, step.id)) {
        return { status: 'COMPLETED', state };
      }
      const runtime = await createRuntime(match, state);
      const rawVotes = Object.entries((state.mvpVotes || {}) as Record<string, unknown>)
        .map(([voterId, targetId]) => ({
          voterId: Number(voterId),
          targetId: Number(targetId),
        }));
      const result = selectWerewolfMvp(
        runtime.agents as PlayerRecord[],
        rawVotes,
        String(state.winner || ''),
      );
      const selectedMvp = result.player
        ? ((state.players || []) as PlayerRecord[]).find((player) => Number(player.id) === Number(result.player?.id))
          || result.player
        : null;
      const mvp = selectedMvp ? toPublicMvp(selectedMvp) : null;
      const voteCount = mvp ? result.tally[String(mvp.id)] || 0 : 0;
      const message = mvp
        ? `本场MVP是${getSeatNumber(Number(mvp.id), runtime.agents)}号${mvp.nickname || mvp.name || '玩家'}，获得${voteCount}票。`
        : '本场没有产生MVP。';
      const nextState = markStepComplete({
        ...syncRuntimeState(runtime),
        currentStep: step.id,
        mvp,
        mvpVotes: Object.fromEntries(result.votes.map((vote) => [vote.voterId, vote.targetId])),
        mvpVoteTally: result.tally,
      }, step.id);

      publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
        builder.setStep(step.id).setPhase('postgame').setDay(resolveLastDay(nextState));
        return builder.build('mvp-result', {
          mvp,
          votes: nextState.mvpVotes,
          tally: result.tally,
          message,
        }, CHANNEL_TYPES.PUBLIC, undefined, { message });
      }, serializeWerewolfState(match, nextState as Record<string, unknown>));

      return {
        status: 'COMPLETED',
        state: nextState,
        events: [createWerewolfEvent(
          match,
          step,
          nextState as Record<string, unknown>,
          'werewolf_mvp_selected',
          message,
          { mvp, votes: nextState.mvpVotes, tally: result.tally },
          { channel: CHANNEL_TYPES.PUBLIC },
        )],
      };
    },
  };
}

function createPostgameCompleteHandler() {
  return {
    execute({ match, step, state }: { match: Match; step: Step; state: StepState }): HandlerResult {
      if (isDone(state, step.id)) {
        return { status: 'COMPLETED', state, matchStatus: MATCH_STATUS.COMPLETED };
      }
      const nextState = markStepComplete({
        ...state,
        currentStep: step.id,
        currentActionWindow: null,
      }, step.id);
      return {
        status: 'COMPLETED',
        state: nextState,
        matchStatus: MATCH_STATUS.COMPLETED,
        events: [createWerewolfEvent(
          match,
          step,
          nextState as Record<string, unknown>,
          'werewolf_game_completed',
          'MVP评选与赛后感言结束，本局游戏完成。',
          { winner: state.winner, mvp: state.mvp || null },
          { channel: CHANNEL_TYPES.PUBLIC },
        )],
      };
    },
  };
}

function resolveLastDay(state: StepState): number {
  const rounds = Array.isArray(state.rounds) ? state.rounds as Array<{ day?: unknown }> : [];
  return Math.max(1, ...rounds.map((round) => Number(round.day) || 0));
}

function toPublicMvp(player: PlayerRecord): PlayerRecord {
  const {
    roleConfig: _roleConfig,
    baseSystemPrompt: _baseSystemPrompt,
    playerAgent: _playerAgent,
    ...publicPlayer
  } = player;
  return publicPlayer;
}

export {
  WEREWOLF_POSTGAME_DAYBREAK_STEP_ID,
  createPostgameResetHandler,
  createPostgameDaybreakHandler,
  createPostgameMvpIntroHandler,
  createMvpResultHandler,
  createPostgameCompleteHandler,
};
export type { PlayerRecord };
