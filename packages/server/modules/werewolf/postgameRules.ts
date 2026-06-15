interface PostgamePlayer {
  id: number;
  faction?: string;
  [key: string]: unknown;
}

interface MvpVote {
  voterId: number;
  targetId: number;
}

interface PostgameSpeechDecision extends Record<string, unknown> {
  speak: boolean;
  text: string;
  thinking: string;
}

function normalizePostgameSpeechDecision(
  value: Record<string, unknown> | null | undefined,
): PostgameSpeechDecision {
  if (value?.speak !== true) {
    return { speak: false, text: '', thinking: '' };
  }
  const text = String(value.text || '').trim().slice(0, 180);
  if (!text) {
    return { speak: false, text: '', thinking: '' };
  }
  return {
    speak: true,
    text,
    thinking: String(value.thinking || ''),
  };
}

function selectWerewolfMvp(
  players: PostgamePlayer[],
  votes: MvpVote[],
  winner: string | null | undefined,
): { player: PostgamePlayer | null; tally: Record<string, number>; votes: MvpVote[] } {
  const byId = new Map(players.map((player) => [Number(player.id), player]));
  const validVotes = votes.filter((vote) => (
    byId.has(Number(vote.voterId))
    && byId.has(Number(vote.targetId))
    && Number(vote.voterId) !== Number(vote.targetId)
  ));
  const tally: Record<string, number> = {};
  for (const vote of validVotes) {
    const key = String(vote.targetId);
    tally[key] = (tally[key] || 0) + 1;
  }

  const winningFaction = winner === 'wolves' ? 'wolves' : winner === 'good' ? 'good' : '';
  const ranked = [...players].sort((left, right) => {
    const voteDelta = (tally[String(right.id)] || 0) - (tally[String(left.id)] || 0);
    if (voteDelta) return voteDelta;
    const leftWinner = winningFaction && left.faction === winningFaction ? 1 : 0;
    const rightWinner = winningFaction && right.faction === winningFaction ? 1 : 0;
    if (leftWinner !== rightWinner) return rightWinner - leftWinner;
    return Number(left.id) - Number(right.id);
  });

  const fallback = [...players]
    .sort((left, right) => Number(left.id) - Number(right.id))
    .find((player) => !winningFaction || player.faction === winningFaction)
    || [...players].sort((left, right) => Number(left.id) - Number(right.id))[0]
    || null;

  return {
    player: Object.keys(tally).length > 0 ? ranked[0] || fallback : fallback,
    tally,
    votes: validVotes,
  };
}

function resolvePostgameSpeechOrder<T extends PostgamePlayer>(players: T[], mvpId?: unknown): T[] {
  const ordered = [...players].sort((left, right) => Number(left.id) - Number(right.id));
  const mvp = ordered.find((player) => Number(player.id) === Number(mvpId));
  return mvp
    ? [...ordered.filter((player) => Number(player.id) !== Number(mvp.id)), mvp]
    : ordered;
}

export {
  normalizePostgameSpeechDecision,
  resolvePostgameSpeechOrder,
  selectWerewolfMvp,
};

export type { MvpVote, PostgamePlayer, PostgameSpeechDecision };
