import type { AvalonPublicState } from '../../../shared/types/avalon';
import type { AvalonState } from './types';
import { getLeaderId, getRoleLabel, getScore } from './rules';

function toAvalonPublicState(state: AvalonState): AvalonPublicState {
  const score = getScore(state);
  const publicState: AvalonPublicState = {
    id: state.id,
    gameType: 'avalon',
    mode: 'standard-5',
    status: state.status,
    missionNumber: state.missionNumber,
    proposalAttempt: state.proposalAttempt,
    leaderId: getLeaderId(state),
    players: state.players.map(({ id, nickname, avatar }) => ({
      id,
      nickname,
      ...(avatar ? { avatar } : {}),
    })),
    missions: state.missions.map((mission) => ({
      number: mission.number,
      teamSize: mission.teamSize,
      status: mission.status,
      attempt: mission.attempt,
      ...(mission.leaderId ? { leaderId: mission.leaderId } : {}),
      teamIds: [...mission.teamIds],
      ...(mission.approveCount !== undefined ? { approveCount: mission.approveCount } : {}),
      ...(mission.rejectCount !== undefined ? { rejectCount: mission.rejectCount } : {}),
      ...(mission.successCount !== undefined ? { successCount: mission.successCount } : {}),
      ...(mission.failCount !== undefined ? { failCount: mission.failCount } : {}),
    })),
    currentTeamIds: [...state.currentTeamIds],
    goodScore: score.good,
    evilScore: score.evil,
  };
  if (state.winner) publicState.winner = state.winner;
  if (state.winReason) publicState.winReason = state.winReason;
  if (state.assassinationTargetId) publicState.assassinationTargetId = state.assassinationTargetId;
  if (state.status === 'completed') {
    publicState.reveal = state.players.map((player) => ({
      playerId: player.id,
      role: player.role,
      faction: player.faction,
    }));
  }
  return publicState;
}

function createAvalonPresentationEvent(
  type: string,
  state: AvalonState,
  message: string,
  details: Record<string, unknown> = {},
): Record<string, unknown> {
  const game = toAvalonPublicState(state);
  return {
    type,
    message,
    game,
    payload: { message, ...details },
    presentation: {
      speakableText: message,
      displayText: message,
      displayMode: type === 'avalon-game-result' ? 'result' : 'status',
      suppressSpeech: false,
      requiresAck: true,
    },
  };
}

function describeReveal(state: AvalonState): string {
  return state.players
    .map((player) => `${player.id}号${player.nickname}：${getRoleLabel(player.role)}`)
    .join('；');
}

export { createAvalonPresentationEvent, describeReveal, toAvalonPublicState };
