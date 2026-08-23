import type { AvalonState } from './types';
import { getCurrentMission } from './rules';

function buildDebugProposal(state: AvalonState): { teamIds: number[]; reason: string } {
  const leaderIndex = state.players.findIndex((player) => player.id === state.players[state.leaderIndex].id);
  const teamSize = getCurrentMission(state).teamSize;
  const teamIds = Array.from({ length: teamSize }, (_, offset) =>
    state.players[(leaderIndex + offset) % state.players.length].id,
  );
  return { teamIds, reason: '调试模式按座次组队' };
}

function buildDebugTeamVote(state: AvalonState, actorId: number): { approve: boolean; reason: string } {
  return {
    approve: state.proposalAttempt < 5 || actorId === state.players[0].id,
    reason: '调试模式合法表决',
  };
}

function buildDebugQuestVote(state: AvalonState, actorId: number): { success: boolean } {
  const actor = state.players.find((player) => player.id === actorId);
  if (!actor || actor.faction === 'good') return { success: true };
  return { success: state.missionNumber === 1 || state.missionNumber === 3 || state.missionNumber === 5 };
}

function buildDebugAssassination(state: AvalonState): { targetId: number; reason: string } {
  const target = state.players.find((player) => player.role === 'percival')
    || state.players.find((player) => player.faction === 'good');
  return { targetId: target!.id, reason: '调试模式刺杀猜测' };
}

export {
  buildDebugAssassination,
  buildDebugProposal,
  buildDebugQuestVote,
  buildDebugTeamVote,
};
