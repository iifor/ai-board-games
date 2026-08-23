import { avalonQuestVoteSchema } from '../../../shared/schemas/avalon';
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
import { countBooleanVotes, getCurrentMission, getScore, rotateLeader } from './rules';
import type { AvalonWorkflowState } from './types';

function createQuestHandler(): StepHandler {
  return {
    async execute({ match, step, state }) {
      const current = state as unknown as AvalonWorkflowState;
      if (isComplete(current, step.id)) return done(current);
      const missionNumber = stepNumber(step, 'mission');
      const attempt = stepNumber(step, 'attempt');
      if (current.missionNumber !== missionNumber || current.proposalAttempt !== attempt) {
        return done(completeStep(current, step.id));
      }
      const matchId = String(match.id);
      const teamPlayers = current.players.filter((player) => current.currentTeamIds.includes(player.id));
      const taskEntries = await Promise.all(teamPlayers.map(async (player) => {
        const taskKey = `quest:${missionNumber}:${player.id}`;
        return { player, taskKey, existing: await findAvalonTask(matchId, step.id, taskKey) };
      }));
      const pending = taskEntries.filter(({ existing }) => existing?.status !== 'succeeded');
      if (pending.length) {
        const next = { ...current, status: 'quest' as const };
        return {
          status: 'WAITING',
          state: next,
          events: [publicEvent(matchId, step.id, 'avalon-quest-start', next, `第${missionNumber}个任务开始执行。`, {
            missionNumber,
            teamIds: current.currentTeamIds,
          })],
          tasks: await Promise.all(pending.filter(({ existing }) => !existing).map(({ player, taskKey }) =>
            createAvalonTask(matchId, step, player.id, 'avalon_quest_vote', taskKey, { faction: player.faction }),
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
      const questVotes = Object.fromEntries(taskEntries.map(({ player, existing }) => {
        const parsed = avalonQuestVoteSchema.parse(taskPayload(existing!));
        return [String(player.id), player.faction === 'good' ? true : parsed.success];
      }));
      const { positive: successCount, negative: failCount } = countBooleanVotes(questVotes);
      const missionSucceeded = failCount === 0;
      const missions = current.missions.map((mission) => mission.number === missionNumber
        ? {
            ...mission,
            status: missionSucceeded ? 'success' as const : 'fail' as const,
            questVotes,
            successCount,
            failCount,
          }
        : mission);
      const scoredState = { ...current, missions };
      const score = getScore(scoredState);
      const goodReachedThree = score.good >= 3;
      const evilReachedThree = score.evil >= 3;
      const nextMission = missionNumber + 1;
      const next = completeStep({
        ...scoredState,
        leaderIndex: rotateLeader(current),
        proposalAttempt: 1,
        missionNumber: Math.min(nextMission, current.missions.length),
        currentTeamIds: [],
        status: goodReachedThree ? 'assassination' : evilReachedThree ? 'completed' : 'proposing',
        ...(evilReachedThree ? {
          winner: 'evil' as const,
          winReason: '邪恶阵营破坏了三个任务。',
        } : {}),
      }, step.id);
      const message = missionSucceeded
        ? `第${missionNumber}个任务成功：${successCount} 张成功票。`
        : `第${missionNumber}个任务失败：出现 ${failCount} 张失败票。`;
      return {
        ...done(next, [publicEvent(matchId, step.id, 'avalon-quest-result', next, message, {
          missionNumber,
          success: missionSucceeded,
          successCount,
          failCount,
          goodScore: score.good,
          evilScore: score.evil,
        })]),
        nextStepId: goodReachedThree
          ? 'assassination'
          : evilReachedThree
            ? 'result'
            : stepId(nextMission, 1, 'propose'),
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

export { createQuestHandler };
