import { BLOCKER_STATUS, BLOCKER_TYPES } from '@ai-presenter/shared/types/workflowTypes';
import * as repo from './repository';
import type { AiTask, PendingAction, StepBlocker } from '../../types/workflow';

function resolveBlockers(matchId: string, blockers: StepBlocker[]): StepBlocker[] {
  const tasks = new Map(repo.listAiTasks(matchId).map((task: AiTask) => [task.id, task]));
  const actions = new Map(
    repo.listPendingActions(matchId).map((action: PendingAction) => [action.id, action]),
  );
  return blockers.map((blocker) => {
    if (blocker.type === BLOCKER_TYPES.AI_TASK && blocker.taskId) {
      const task = tasks.get(blocker.taskId);
      if (task?.status === 'succeeded') return { ...blocker, status: BLOCKER_STATUS.COMPLETED };
      if (task?.status === 'failed') return { ...blocker, status: BLOCKER_STATUS.FAILED };
      if (task?.status === 'cancelled') return { ...blocker, status: BLOCKER_STATUS.CANCELLED };
    }
    if (blocker.type === BLOCKER_TYPES.HUMAN_ACTION && blocker.actionId) {
      const action = actions.get(blocker.actionId);
      if (action?.status === 'submitted') return { ...blocker, status: BLOCKER_STATUS.COMPLETED };
      if (action?.status === 'expired') return { ...blocker, status: BLOCKER_STATUS.EXPIRED };
      if (action?.status === 'cancelled') return { ...blocker, status: BLOCKER_STATUS.CANCELLED };
      if (action?.status === 'failed') return { ...blocker, status: BLOCKER_STATUS.FAILED };
    }
    return { ...blocker, status: blocker.status || BLOCKER_STATUS.PENDING };
  });
}

export { resolveBlockers };
