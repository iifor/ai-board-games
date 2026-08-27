import { avalonTeamVoteSchema } from '../../../shared/schemas/avalon';
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
import { countBooleanVotes, getCurrentMission, rotateLeader } from './rules';
import type { AvalonWorkflowState } from './types';

function createTeamVoteHandler(): StepHandler {
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
      const taskEntries = await Promise.all(current.players.map(async (player) => {
        const taskKey = `team-vote:${missionNumber}:${attempt}:${player.id}`;
        return { player, taskKey, existing: await findAvalonTask(matchId, step.id, taskKey, db) };
      }));
      const pending = taskEntries.filter(({ existing }) => existing?.status !== 'succeeded');
      if (pending.length) {
        const next = { ...current, status: 'team-vote' as const };
        return {
          status: 'WAITING',
          state: next,
          events: [publicEvent(matchId, step.id, 'avalon-team-vote-start', next, '全员开始表决当前任务队。', {
            missionNumber,
            attempt,
            teamIds: current.currentTeamIds,
          })],
          tasks: await Promise.all(pending.filter(({ existing }) => !existing).map(({ player, taskKey }) =>
            createAvalonTask(matchId, step, player.id, 'avalon_team_vote', taskKey, {}, db),
          )),
          blockers: pending.map(({ player, taskKey, existing }) => taskBlocker(
            step.id,
            taskKey,
            player.id,
            existing?.id || `${matchId}:${step.id}:${taskKey}`,
            existing?.status,
          )),
        };
      }
      const votes = Object.fromEntries(taskEntries.map(({ player, existing }) => [
        String(player.id),
        avalonTeamVoteSchema.parse(taskPayload(existing!)).approve,
      ]));
      const { positive: approveCount, negative: rejectCount } = countBooleanVotes(votes);
      const approved = approveCount > rejectCount;
      const mission = getCurrentMission(current);
      const exhausted = !approved && attempt >= 5;
      const nextAttempt = approved ? attempt : attempt + 1;
      const missions = current.missions.map((item) => item.number === mission.number
        ? {
            ...item,
            status: approved ? 'quest' as const : 'pending' as const,
            teamVotes: votes,
            approveCount,
            rejectCount,
            attempt: nextAttempt,
          }
        : item);
      const next = completeStep({
        ...current,
        missions,
        leaderIndex: approved ? current.leaderIndex : rotateLeader(current),
        proposalAttempt: nextAttempt,
        status: exhausted ? 'completed' : approved ? 'quest' : 'proposing',
        currentTeamIds: approved ? current.currentTeamIds : [],
        ...(exhausted ? {
          winner: 'evil' as const,
          winReason: '连续五次组队表决未通过，邪恶阵营获胜。',
        } : {}),
      }, step.id);
      const message = approved
        ? `组队通过：${approveCount} 票赞成，${rejectCount} 票反对。`
        : `组队被否决：${approveCount} 票赞成，${rejectCount} 票反对。`;
      return {
        ...done(next, [publicEvent(matchId, step.id, 'avalon-team-vote-result', next, message, {
          missionNumber,
          attempt,
          approved,
          approveCount,
          rejectCount,
        })]),
        nextStepId: exhausted
          ? 'result'
          : approved
            ? stepId(missionNumber, attempt, 'quest')
            : stepId(missionNumber, attempt + 1, 'propose'),
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

export { createTeamVoteHandler };
