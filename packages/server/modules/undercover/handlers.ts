import { undercoverSpeechSchema, undercoverVoteSchema } from '../../../shared/schemas/undercover';
import { getAiConfig } from '../../config/ai';
import type { AiTask } from '../../types/workflow';
import { BasePlayerAgent } from '../agent-core/playerAgent';
import * as repository from '../workflow-engine/repository';
import { stableTaskId } from '../workflow-engine/utils';
import type { StepHandler, WorkflowStep } from '../workflow-engine/workflowRegistry';
import { createUndercoverPresentationEvent } from './presentation';
import { buildUndercoverDebugSpeech, buildUndercoverDebugVote } from './debug';
import { buildUndercoverSpeechPrompt, buildUndercoverSystemPrompt, buildUndercoverVotePrompt } from './prompts';
import {
  checkWinner,
  eliminatePlayer,
  getLegalVoteTargets,
  resolveVote,
  seededIndex,
  validatePublicSpeech,
} from './rules';
import type { UndercoverState, VoteResolution } from './types';

interface WorkflowState extends UndercoverState {
  completedSteps: Record<string, boolean>;
  [key: string]: unknown;
}

interface MatchContext {
  id: string;
  state: WorkflowState;
}

type EventDetails = Record<string, unknown>;

function createUndercoverHandlers(): Record<string, StepHandler> {
  return {
    'undercover.setup': {
      execute({ match, step, state }) {
        const current = state as unknown as WorkflowState;
        if (isComplete(current, step.id)) return done(current);
        const next = completeStep(current, step.id);
        const debugMode = (match as { config?: { debugMode?: boolean } }).config?.debugMode === true;
        return done(next, debugMode
          ? [publicEvent(
              match.id as string,
              step.id,
              'undercover-debug-ready',
              next,
              '调试对局已就绪',
              { matchId: match.id },
            )]
          : []);
      },
    },
    'undercover.round_start': {
      execute({ match, step, state }) {
        const current = state as unknown as WorkflowState;
        if (isComplete(current, step.id)) return done(current);
        const round = Number(stepConfig(step).round || current.round);
        const next = completeStep({ ...current, status: 'speaking', round, votes: {}, runoffCandidateIds: [] }, step.id);
        return done(next, [publicEvent(match.id as string, step.id, 'undercover-round-start', next, `第${round}轮开始`, { round })]);
      },
    },
    'undercover.speech': createSpeechHandler(),
    'undercover.vote': createVoteHandler(),
    'undercover.resolve': {
      execute({ match, step, state }) {
        const current = state as unknown as WorkflowState;
        if (isComplete(current, step.id)) return done(current);
        const runoff = current.runoffCandidateIds.length > 0;
        const resolution = resolveVote(current, current.votes, runoff);
        if (resolution.kind !== 'eliminate') return done(completeStep(current, step.id));

        let next = eliminatePlayer(current, resolution.playerId, current.round) as WorkflowState;
        const winner = checkWinner(next);
        next = completeStep({
          ...next,
          ...(winner ? { winner: winner.winner, winReason: winner.reason } : {}),
        }, step.id);
        const message = `${resolution.playerId}号玩家被淘汰。`;
        return {
          ...done(next, [publicEvent(match.id as string, step.id, 'undercover-eliminated', next, message, {
            round: current.round,
            playerId: resolution.playerId,
          })]),
          ...(winner ? { nextStepId: 'result' } : {}),
        };
      },
    },
    'undercover.result': {
      execute({ match, step, state }) {
        const current = state as unknown as WorkflowState;
        if (isComplete(current, step.id)) return { ...done(current), matchStatus: 'completed' };
        const next = completeStep({ ...current, status: 'completed' }, step.id);
        const message = next.winner === 'civilians' ? '平民获胜，卧底身份已经揭晓。' : '卧底获胜，身份已经揭晓。';
        return {
          ...done(next, [publicEvent(match.id as string, step.id, 'undercover-game-result', next, message, {
            winner: next.winner,
            winReason: next.winReason,
          })]),
          matchStatus: 'completed',
        };
      },
    },
  };
}

function createSpeechHandler(): StepHandler {
  return {
    execute({ match, step, state }) {
      const current = state as unknown as WorkflowState;
      const typedMatch = match as unknown as MatchContext;
      if (isComplete(current, step.id)) return done(current);
      const round = Number(stepConfig(step).round || current.round);
      const orderIndex = Number(stepConfig(step).orderIndex || 0);
      const speaker = current.players[(round - 1 + orderIndex) % current.players.length];
      if (!speaker?.alive) return done(completeStep(current, step.id));

      const task = findTask(typedMatch.id, step.id, `speech:${speaker.id}`);
      if (!task || task.status !== 'succeeded') {
        return wait(current, typedMatch.id, step, speaker.id, 'undercover_speech', task, { actorId: speaker.id, round });
      }
      const parsed = undercoverSpeechSchema.parse(taskPayload(task));
      const validated = validatePublicSpeech(parsed.speech, current.wordPair);
      const speech = validated.ok ? validated.text : '这个事物在生活中并不少见';
      const next = completeStep({
        ...current,
        speeches: [...current.speeches, { round, playerId: speaker.id, text: speech }],
      }, step.id);
      return done(next, [publicEvent(typedMatch.id, step.id, 'undercover-speech', next, `${speaker.nickname}：${speech}`, {
        round,
        playerId: speaker.id,
        text: speech,
      })]);
    },
    async runAiTask({ match, task }) {
      const current = (match as unknown as MatchContext).state;
      const actorId = Number(task.playerId);
      const debugMode = (match as { config?: { debugMode?: boolean } }).config?.debugMode === true;
      if (debugMode) return aiResult(task.action as string, buildUndercoverDebugSpeech(current, actorId));
      const agent = createAgent(match.id as string, current, actorId);
      const prompt = buildUndercoverSpeechPrompt(current, actorId);
      const schema = undercoverSpeechSchema.refine(
        ({ speech }) => validatePublicSpeech(speech, current.wordPair).ok,
        { message: 'secret-leak' },
      );
      const speech = parseSafeSpeech(await agent.askJson(prompt, {
        skillId: 'undercover-speech',
        phase: 'speech',
        promptHasContract: true,
        schema,
      }), current);
      if (speech) return aiResult(task.action as string, { speech });
      agent.recordError('undercover-speech', 'secret-leak', { phase: 'speech' });
      return aiResult(task.action as string, { speech: '这个事物在生活中并不少见', fallbackReason: 'secret-leak' });
    },
    validateAiResult({ task, result }) {
      validateTaskAction(task, result);
      undercoverSpeechSchema.parse(result.payload);
    },
  };
}

function createVoteHandler(): StepHandler {
  return {
    execute({ match, step, state }) {
      const current = state as unknown as WorkflowState;
      const matchId = match.id as string;
      if (isComplete(current, step.id)) return done(current);
      const runoff = Boolean(stepConfig(step).runoff);
      if (runoff && !current.runoffCandidateIds.length) return done(completeStep(current, step.id));

      const voters = current.players.filter((player) => player.alive);
      const tasks = voters.map((voter) => {
        const legalIds = getLegalVoteTargets(current, voter.id, runoff ? current.runoffCandidateIds : []);
        const existing = findTask(matchId, step.id, `vote:${voter.id}`);
        return { voter, legalIds, existing };
      }).filter(({ legalIds }) => legalIds.length > 0);
      const pending = tasks.filter(({ existing }) => existing?.status !== 'succeeded');
      if (pending.length) {
        const next = { ...current, status: 'voting' as const };
        const events = [publicEvent(matchId, step.id, 'undercover-vote-start', next, runoff ? '平票复投开始。' : `第${current.round}轮投票开始。`, {
          round: current.round,
          runoff,
        })];
        return {
          status: 'WAITING',
          state: next,
          events,
          tasks: pending.filter(({ existing }) => !existing).map(({ voter, legalIds }) => taskSpec(matchId, step, voter.id, 'undercover_vote', {
            actorId: voter.id,
            round: current.round,
            runoff,
            legalIds,
          })),
          blockers: pending.map(({ voter, existing }) => blocker(
            step.id,
            `vote:${voter.id}`,
            voter.id,
            existing?.id || stableTaskId(matchId, step.id, `vote:${voter.id}`),
            existing?.status,
          )),
        };
      }

      const votes = Object.fromEntries(tasks.map(({ voter, legalIds, existing }) => {
        const parsed = undercoverVoteSchema.parse(taskPayload(existing!));
        const targetId = legalIds.includes(parsed.targetId)
          ? parsed.targetId
          : legalIds[seededIndex(
            current.seed,
            legalIds.length,
            Math.imul(current.round, 31) ^ Math.imul(voter.id, 131) ^ (runoff ? 1 : 0),
          )];

        return [String(voter.id), targetId];
      }));
      const resolution = resolveVote(current, votes, runoff);
      const next = completeStep({
        ...current,
        votes,
        runoffCandidateIds: resolution.kind === 'runoff' ? resolution.candidateIds : current.runoffCandidateIds,
      }, step.id);
      const details = voteDetails(current.round, runoff, resolution);
      return {
        ...done(next, [publicEvent(matchId, step.id, 'undercover-vote-result', next, resolution.kind === 'runoff' ? '本轮投票平票，进入复投。' : '投票结束。', details)]),
        nextStepId: resolution.kind === 'runoff' ? `round_${current.round}_runoff` : `round_${current.round}_resolve`,
      };
    },
    async runAiTask({ match, task }) {
      const current = (match as unknown as MatchContext).state;
      const actorId = Number(task.playerId);
      const context = task.promptContextSnapshot as { legalIds?: number[]; runoff?: boolean };
      const legalIds = (context.legalIds || []).map(Number);
      if (!legalIds.length) throw new Error(`Undercover voter ${actorId} has no legal targets`);
      const debugMode = (match as { config?: { debugMode?: boolean } }).config?.debugMode === true;
      if (debugMode) return aiResult(task.action as string, buildUndercoverDebugVote(current, actorId, legalIds, context.runoff === true));
      const agent = createAgent(match.id as string, current, actorId);
      const prompt = buildUndercoverVotePrompt(current, actorId, legalIds);
      const schema = undercoverVoteSchema.refine(
        ({ targetId }) => legalIds.includes(targetId),
        { message: `targetId must be one of: ${legalIds.join(', ')}` },
      );
      const vote = parseSafeVote(await agent.askJson(prompt, {
        skillId: 'undercover-vote',
        phase: 'vote',
        promptHasContract: true,
        schema,
      }), legalIds);
      if (vote) return aiResult(task.action as string, vote);
      const targetId = legalIds[seededIndex(current.seed, legalIds.length, Math.imul(current.round, 31) ^ Math.imul(actorId, 131) ^ (context.runoff ? 1 : 0))];
      agent.recordError('undercover-vote', 'invalid-target', { phase: 'vote' });
      return aiResult(task.action as string, { targetId, reason: '', fallbackReason: 'invalid-target' });
    },
    validateAiResult({ task, result }) {
      validateTaskAction(task, result);
      const parsed = undercoverVoteSchema.parse(result.payload);
      const legalIds = ((task.promptContextSnapshot as { legalIds?: number[] }).legalIds || []).map(Number);
      if (!legalIds.includes(parsed.targetId)) throw new Error(`Invalid undercover vote target: ${parsed.targetId}`);
    },
  };
}

function createAgent(matchId: string, state: WorkflowState, actorId: number): BasePlayerAgent {
  const player = getAiConfig().players.find((candidate) => Number(candidate.id) === actorId);
  if (!player) throw new Error(`Configured undercover player not found: ${actorId}`);
  return new BasePlayerAgent(player as unknown as ConstructorParameters<typeof BasePlayerAgent>[0], buildUndercoverSystemPrompt(state, actorId), {
    gameId: matchId,
    gameType: 'undercover',
    fallbackModel: player.fallbackModel,
  });
}

function wait(state: WorkflowState, matchId: string, step: WorkflowStep, playerId: number, action: string, existing: AiTask | null, context: EventDetails) {
  const taskKey = action === 'undercover_speech' ? `speech:${playerId}` : `vote:${playerId}`;
  return {
    status: 'WAITING',
    state,
    tasks: existing ? [] : [taskSpec(matchId, step, playerId, action, context)],
    blockers: [blocker(step.id, taskKey, playerId, existing?.id || stableTaskId(matchId, step.id, taskKey), existing?.status)],
  };
}

function taskSpec(matchId: string, step: WorkflowStep, playerId: number, action: string, context: EventDetails) {
  const taskKey = action === 'undercover_speech' ? `speech:${playerId}` : `vote:${playerId}`;
  return {
    id: stableTaskId(matchId, step.id, taskKey),
    matchId,
    stepId: step.id,
    taskKey,
    playerId,
    action,
    status: 'queued',
    prompt: { action },
    promptContextSnapshot: context,
    visibleEventSeqMax: Math.max(0, ...repository.listEvents(matchId).map((event) => event.seq)),
    visibleEventIds: [],
  };
}

function blocker(stepId: string, taskKey: string, playerId: number, taskId: string, status?: string) {
  return {
    id: `${stepId}:${taskKey}`,
    type: 'AI_TASK',
    required: true,
    status: status === 'failed' ? 'failed' : 'pending',
    taskId,
    playerId,
  };
}

function findTask(matchId: string, stepId: string, taskKey: string): AiTask | null {
  return repository.listAiTasks(matchId).find((task) => task.stepId === stepId && task.taskKey === taskKey) || null;
}

function taskPayload(task: AiTask): Record<string, unknown> {
  const result = task.result as { payload?: Record<string, unknown> } | null;
  return result?.payload || {};
}

function completeStep(state: WorkflowState, stepId: string): WorkflowState {
  return { ...state, completedSteps: { ...(state.completedSteps || {}), [stepId]: true } };
}

function isComplete(state: WorkflowState, stepId: string): boolean {
  return Boolean(state.completedSteps?.[stepId]);
}

function done(state: WorkflowState, events: EventDetails[] = []) {
  return { status: 'COMPLETED', state, ...(events.length ? { events } : {}) };
}

function publicEvent(matchId: string, stepId: string, type: string, state: WorkflowState, message: string, details: EventDetails = {}) {
  const presentation = createUndercoverPresentationEvent(type, state, { message });
  return {
    type,
    visibility: 'public',
    channel: 'public',
    payload: { ...presentation, payload: { ...presentation.payload, ...details } },
    idempotencyKey: `${matchId}:${stepId}:${type}`,
  };
}

function parseSafeSpeech(value: unknown, state: WorkflowState): string | null {
  const parsed = undercoverSpeechSchema.safeParse(value);
  if (!parsed.success) return null;
  const validated = validatePublicSpeech(parsed.data.speech, state.wordPair);
  return validated.ok ? validated.text : null;
}

function parseSafeVote(value: unknown, legalIds: number[]) {
  const parsed = undercoverVoteSchema.safeParse(value);
  return parsed.success && legalIds.includes(parsed.data.targetId) ? parsed.data : null;
}

function aiResult(action: string, payload: EventDetails) {
  return { eventType: 'ai_task_succeeded', rawOutput: payload, payload: { action, ...payload } };
}

function validateTaskAction(task: Record<string, unknown>, result: Record<string, unknown>): void {
  if ((result.payload as EventDetails | undefined)?.action !== task.action) throw new Error('Undercover AI result action mismatch');
}

function voteDetails(round: number, runoff: boolean, resolution: VoteResolution): EventDetails {
  return {
    round,
    runoff,
    tally: resolution.tally,
    tiedCandidateIds: resolution.kind === 'runoff' ? resolution.candidateIds : [],
    ...(resolution.kind === 'eliminate' ? { eliminatedPlayerId: resolution.playerId } : {}),
  };
}

function stepConfig(step: WorkflowStep): Record<string, unknown> {
  return (step.config || {}) as Record<string, unknown>;
}

export { createUndercoverHandlers };
export type { WorkflowState };
