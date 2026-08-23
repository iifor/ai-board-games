import { avalonAssassinationSchema } from '../../../shared/schemas/avalon';
import type { StepHandler } from '../workflow-engine/workflowRegistry';
import {
  createAvalonTask,
  findAvalonTask,
  runAvalonAiTask,
  taskBlocker,
  taskPayload,
  validateAvalonAiResult,
} from './ai';
import { completeStep, done, isComplete, publicEvent } from './handlerUtils';
import type { AvalonWorkflowState } from './types';

function createAssassinationHandler(): StepHandler {
  return {
    async execute({ match, step, state }) {
      const current = state as unknown as AvalonWorkflowState;
      if (isComplete(current, step.id)) return done(current);
      if (current.status !== 'assassination') {
        return { ...done(completeStep(current, step.id)), nextStepId: 'result' };
      }
      const matchId = String(match.id);
      const assassin = current.players.find((player) => player.role === 'assassin');
      if (!assassin) throw new Error('Avalon assassin is missing');
      const legalIds = current.players.filter((player) => player.faction === 'good').map((player) => player.id);
      const taskKey = 'assassination';
      const existing = await findAvalonTask(matchId, step.id, taskKey);
      if (!existing || existing.status !== 'succeeded') {
        return {
          status: 'WAITING',
          state: current,
          tasks: existing ? [] : [await createAvalonTask(
            matchId,
            step,
            assassin.id,
            'avalon_assassinate',
            taskKey,
            { legalIds },
          )],
          blockers: [taskBlocker(
            step.id,
            taskKey,
            assassin.id,
            existing?.id || `${matchId}:${step.id}:${taskKey}`,
            existing?.status,
          )],
        };
      }
      const assassination = avalonAssassinationSchema.parse(taskPayload(existing));
      if (!legalIds.includes(assassination.targetId)) throw new Error('Avalon assassination target is invalid');
      const target = current.players.find((player) => player.id === assassination.targetId)!;
      const hitMerlin = target.role === 'merlin';
      const next = completeStep({
        ...current,
        status: 'completed',
        assassinationTargetId: target.id,
        winner: hitMerlin ? 'evil' : 'good',
        winReason: hitMerlin
          ? '刺客成功找到梅林，邪恶阵营逆转获胜。'
          : '刺客未能找到梅林，好人阵营获胜。',
      }, step.id);
      const message = `刺客选择了 ${target.id}号${target.nickname}。${next.winReason}`;
      return {
        ...done(next, [publicEvent(matchId, step.id, 'avalon-assassination-result', next, message, {
          assassinId: assassin.id,
          targetId: target.id,
          hitMerlin,
        })]),
        nextStepId: 'result',
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

export { createAssassinationHandler };
