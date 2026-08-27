import { avalonProposalSchema } from '../../../shared/schemas/avalon';
import type { StepHandler } from '../workflow-engine/workflowRegistry';
import {
  createAvalonTask,
  findAvalonTask,
  runAvalonAiTask,
  taskBlocker,
  taskPayload,
  validateAvalonAiResult,
} from './ai';
import { completeStep, done, isComplete, publicEvent, stepId, stepNumber } from './handlerUtils';
import { getCurrentMission, getLeaderId, validateProposedTeam } from './rules';
import type { AvalonWorkflowState } from './types';

function createProposalHandler(): StepHandler {
  return {
    async execute({ match, step, state, db }) {
      const current = state as unknown as AvalonWorkflowState;
      if (isComplete(current, step.id)) return done(current);
      const missionNumber = stepNumber(step, 'mission');
      const attempt = stepNumber(step, 'attempt');
      if (current.missionNumber !== missionNumber || current.proposalAttempt !== attempt) {
        return done(completeStep(current, step.id));
      }
      const matchId = String(match.id);
      const leaderId = getLeaderId(current);
      const taskKey = `proposal:${missionNumber}:${attempt}`;
      const existing = await findAvalonTask(matchId, step.id, taskKey, db);
      if (!existing || existing.status !== 'succeeded') {
        const taskId = existing?.id || `${matchId}:${step.id}:${taskKey}`;
        return {
          status: 'WAITING',
          state: { ...current, status: 'proposing' },
          tasks: existing ? [] : [await createAvalonTask(
            matchId,
            step,
            leaderId,
            'avalon_propose_team',
            taskKey,
            {
              legalIds: current.players.map((player) => player.id),
              teamSize: getCurrentMission(current).teamSize,
            },
            db,
          )],
          blockers: [taskBlocker(step.id, taskKey, leaderId, taskId, existing?.status)],
        };
      }
      const proposal = avalonProposalSchema.parse(taskPayload(existing));
      if (!validateProposedTeam(current, proposal.teamIds)) {
        throw new Error('Avalon proposal contains an invalid team');
      }
      const mission = getCurrentMission(current);
      const missions = current.missions.map((item) => item.number === missionNumber
        ? {
            ...item,
            status: 'team-vote' as const,
            attempt,
            leaderId,
            teamIds: [...proposal.teamIds],
            teamVotes: {},
            questVotes: {},
          }
        : item);
      const next = completeStep({
        ...current,
        status: 'team-vote',
        missions,
        currentTeamIds: [...proposal.teamIds],
      }, step.id);
      const message = `${leaderId}号队长提议由 ${proposal.teamIds.join('、')} 号组成任务队。`;
      return {
        ...done(next, [publicEvent(matchId, step.id, 'avalon-team-proposed', next, message, {
          missionNumber,
          attempt,
          leaderId,
          teamIds: proposal.teamIds,
          reason: proposal.reason,
        })]),
        nextStepId: stepId(missionNumber, attempt, 'team_vote'),
      };
    },
    async runAiTask({ match, task }) {
      return runAvalonAiTask(
        String(match.id),
        match.state as unknown as AvalonWorkflowState,
        task,
        (match.config as Record<string, unknown>).debugMode === true,
      );
    },
    validateAiResult({ task, result }) {
      validateAvalonAiResult(task, result);
    },
  };
}

export { createProposalHandler };
