import type { UndercoverPublicState } from '../types';

export function getUndercoverVoteSummary(game: UndercoverPublicState): string[] {
  const result = game.voteResult;
  if (!result) return [];
  const summary: string[] = [];
  const tiedCandidates = result.tiedCandidateIds.map((id) => getUndercoverPlayerLabel(game, id));
  if (tiedCandidates.length) {
    summary.push(`平票候选：${tiedCandidates.join('、')}${result.runoff ? '；本轮为加赛投票。' : '，将进入加赛投票。'}`);
  } else if (result.runoff) {
    summary.push('本轮为加赛投票。');
  }
  if (result.eliminatedPlayerId !== undefined) {
    summary.push(`本轮淘汰：${getUndercoverPlayerLabel(game, result.eliminatedPlayerId)}。`);
  }
  return summary;
}

export function getUndercoverPlayerLabel(game: UndercoverPublicState, playerId: number): string {
  const player = game.players.find((item) => item.id === playerId);
  return player ? `${player.id}号 ${player.nickname}` : `${playerId}号`;
}
