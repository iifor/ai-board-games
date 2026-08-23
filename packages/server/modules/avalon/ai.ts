import {
  avalonAssassinationSchema,
  avalonProposalSchema,
  avalonQuestVoteSchema,
  avalonTeamVoteSchema,
} from '../../../shared/schemas/avalon';
import { getAiConfig } from '../../config/ai';
import type { AiTask } from '../../types/workflow';
import { BasePlayerAgent } from '../agent-core/playerAgent';
import * as repository from '../workflow-engine/repository';
import { stableTaskId } from '../workflow-engine/utils';
import type { WorkflowStep } from '../workflow-engine/workflowRegistry';
import {
  buildDebugAssassination,
  buildDebugProposal,
  buildDebugQuestVote,
  buildDebugTeamVote,
} from './debug';
import {
  buildAssassinationPrompt,
  buildAvalonSystemPrompt,
  buildProposalPrompt,
  buildQuestVotePrompt,
  buildTeamVotePrompt,
} from './prompts';
import type { AvalonWorkflowState } from './types';

type AvalonAction =
  | 'avalon_propose_team'
  | 'avalon_team_vote'
  | 'avalon_quest_vote'
  | 'avalon_assassinate';

interface AvalonTaskContext extends Record<string, unknown> {
  legalIds?: number[];
  teamSize?: number;
  faction?: string;
}

async function runAvalonAiTask(
  matchId: string,
  state: AvalonWorkflowState,
  rawTask: Record<string, unknown>,
  debugMode: boolean,
): Promise<Record<string, unknown>> {
  const task = rawTask as unknown as AiTask;
  const actorId = Number(task.playerId);
  const action = task.action as AvalonAction;
  const context = (task.promptContextSnapshot || {}) as AvalonTaskContext;
  if (debugMode) return aiResult(action, debugPayload(action, state, actorId));

  const agent = await createAgent(matchId, state, actorId);
  if (action === 'avalon_propose_team') {
    const legalIds = normalizeIds(context.legalIds);
    const teamSize = Number(context.teamSize);
    const schema = avalonProposalSchema.refine(
      ({ teamIds }) => teamIds.length === teamSize
        && new Set(teamIds).size === teamSize
        && teamIds.every((id) => legalIds.includes(id)),
      { message: 'teamIds must be a legal unique mission team' },
    );
    const value = await agent.askJson(buildProposalPrompt(state, legalIds), requestOptions('avalon-propose', 'proposal', schema));
    return aiResult(action, schema.parse(value));
  }
  if (action === 'avalon_team_vote') {
    const value = await agent.askJson(buildTeamVotePrompt(state), requestOptions('avalon-team-vote', 'team-vote', avalonTeamVoteSchema));
    return aiResult(action, avalonTeamVoteSchema.parse(value));
  }
  if (action === 'avalon_quest_vote') {
    const value = await agent.askJson(buildQuestVotePrompt(state, actorId), requestOptions('avalon-quest-vote', 'quest', avalonQuestVoteSchema));
    const parsed = avalonQuestVoteSchema.parse(value);
    return aiResult(action, context.faction === 'good' ? { success: true } : parsed);
  }
  const legalIds = normalizeIds(context.legalIds);
  const schema = avalonAssassinationSchema.refine(
    ({ targetId }) => legalIds.includes(targetId),
    { message: 'targetId must be a legal assassination target' },
  );
  const value = await agent.askJson(buildAssassinationPrompt(state, legalIds), requestOptions('avalon-assassinate', 'assassination', schema));
  return aiResult(action, schema.parse(value));
}

function validateAvalonAiResult(rawTask: Record<string, unknown>, result: Record<string, unknown>): void {
  const task = rawTask as unknown as AiTask;
  const payload = (result.payload || {}) as Record<string, unknown>;
  if (payload.action !== task.action) throw new Error('Avalon AI result action mismatch');
  const context = (task.promptContextSnapshot || {}) as AvalonTaskContext;
  if (task.action === 'avalon_propose_team') {
    const parsed = avalonProposalSchema.parse(payload);
    const legalIds = normalizeIds(context.legalIds);
    if (
      parsed.teamIds.length !== Number(context.teamSize)
      || new Set(parsed.teamIds).size !== parsed.teamIds.length
      || parsed.teamIds.some((id) => !legalIds.includes(id))
    ) throw new Error('Avalon proposal contains an invalid team');
    return;
  }
  if (task.action === 'avalon_team_vote') {
    avalonTeamVoteSchema.parse(payload);
    return;
  }
  if (task.action === 'avalon_quest_vote') {
    const parsed = avalonQuestVoteSchema.parse(payload);
    if (context.faction === 'good' && !parsed.success) throw new Error('Good Avalon players cannot fail a quest');
    return;
  }
  const parsed = avalonAssassinationSchema.parse(payload);
  if (!normalizeIds(context.legalIds).includes(parsed.targetId)) {
    throw new Error('Avalon assassination target is invalid');
  }
}

async function createAvalonTask(
  matchId: string,
  step: WorkflowStep,
  playerId: number,
  action: AvalonAction,
  taskKey: string,
  context: AvalonTaskContext,
) {
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
    visibleEventSeqMax: Math.max(0, ...(await repository.listEvents(matchId)).map((event) => event.seq)),
    visibleEventIds: [],
  };
}

async function findAvalonTask(matchId: string, stepId: string, taskKey: string): Promise<AiTask | null> {
  return (await repository.listAiTasks(matchId))
    .find((task) => task.stepId === stepId && task.taskKey === taskKey) || null;
}

function taskPayload(task: AiTask): Record<string, unknown> {
  return ((task.result as { payload?: Record<string, unknown> } | null)?.payload || {});
}

function taskBlocker(stepId: string, taskKey: string, playerId: number, taskId: string, status?: string) {
  return {
    id: `${stepId}:${taskKey}`,
    type: 'AI_TASK',
    required: true,
    status: status === 'failed' ? 'failed' : 'pending',
    taskId,
    playerId,
  };
}

async function createAgent(matchId: string, state: AvalonWorkflowState, actorId: number): Promise<BasePlayerAgent> {
  const player = (await getAiConfig()).players.find((candidate) => Number(candidate.id) === actorId);
  if (!player) throw new Error(`Configured Avalon player not found: ${actorId}`);
  return new BasePlayerAgent(
    player as unknown as ConstructorParameters<typeof BasePlayerAgent>[0],
    buildAvalonSystemPrompt(state, actorId),
    { gameId: matchId, gameType: 'avalon', fallbackModel: player.fallbackModel },
  );
}

function debugPayload(action: AvalonAction, state: AvalonWorkflowState, actorId: number): Record<string, unknown> {
  if (action === 'avalon_propose_team') return buildDebugProposal(state);
  if (action === 'avalon_team_vote') return buildDebugTeamVote(state, actorId);
  if (action === 'avalon_quest_vote') return buildDebugQuestVote(state, actorId);
  return buildDebugAssassination(state);
}

function requestOptions(
  skillId: string,
  phase: string,
  schema: {
    safeParse(value: unknown):
      | { success: true; data: Record<string, unknown> }
      | { success: false };
  },
) {
  return { skillId, phase, promptHasContract: true, schema };
}

function aiResult(action: AvalonAction, payload: Record<string, unknown>) {
  return { eventType: 'ai_task_succeeded', rawOutput: payload, payload: { action, ...payload } };
}

function normalizeIds(value: unknown): number[] {
  return Array.isArray(value)
    ? value.map(Number).filter((id) => Number.isInteger(id) && id > 0)
    : [];
}

export {
  createAvalonTask,
  findAvalonTask,
  runAvalonAiTask,
  taskBlocker,
  taskPayload,
  validateAvalonAiResult,
};
export type { AvalonAction, AvalonTaskContext };
