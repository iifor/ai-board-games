import type { StepHandler } from '../workflow-engine/workflowRegistry';
import { createAssassinationHandler } from './assassinationHandler';
import { completeStep, done, isComplete, publicEvent } from './handlerUtils';
import { describeReveal } from './presentation';
import { createProposalHandler } from './proposalHandler';
import { createQuestHandler } from './questHandler';
import { createTeamVoteHandler } from './teamVoteHandler';
import type { AvalonWorkflowState } from './types';

function createAvalonHandlers(): Record<string, StepHandler> {
  return {
    'avalon.setup': {
      execute({ match, step, state }) {
        const current = state as unknown as AvalonWorkflowState;
        if (isComplete(current, step.id)) return done(current);
        const next = completeStep({ ...current, status: 'proposing' }, step.id);
        return done(next, [publicEvent(
          String(match.id),
          step.id,
          'avalon-game-ready',
          next,
          '阿瓦隆对局就绪，身份已私密分配。',
          { missionNumber: 1 },
        )]);
      },
    },
    'avalon.propose': createProposalHandler(),
    'avalon.team_vote': createTeamVoteHandler(),
    'avalon.quest': createQuestHandler(),
    'avalon.assassination': createAssassinationHandler(),
    'avalon.result': {
      execute({ match, step, state }) {
        const current = state as unknown as AvalonWorkflowState;
        if (isComplete(current, step.id)) return { ...done(current), matchStatus: 'completed' };
        if (!current.winner) throw new Error('Avalon result requires a winner');
        const next = completeStep({ ...current, status: 'completed' }, step.id);
        const message = `${next.winner === 'good' ? '好人' : '邪恶'}阵营获胜。${next.winReason || ''} 身份揭晓：${describeReveal(next)}`;
        return {
          ...done(next, [publicEvent(
            String(match.id),
            step.id,
            'avalon-game-result',
            next,
            message,
            { winner: next.winner, winReason: next.winReason },
          )]),
          matchStatus: 'completed',
        };
      },
    },
  };
}

export { createAvalonHandlers };
