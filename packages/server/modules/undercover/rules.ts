import type {
  UndercoverPlayerInput,
  UndercoverSetupOptions,
  UndercoverState,
  UndercoverWordPair,
  VoteResolution,
} from './types';

const UNDERCOVER_WORD_PAIRS: UndercoverWordPair[] = [
  { civilian: '咖啡', undercover: '茶' },
  { civilian: '牛奶', undercover: '豆浆' },
  { civilian: '火锅', undercover: '麻辣烫' },
  { civilian: '手机', undercover: '平板电脑' },
  { civilian: '地铁', undercover: '公交车' },
  { civilian: '雨伞', undercover: '雨衣' },
  { civilian: '电影', undercover: '电视剧' },
  { civilian: '饺子', undercover: '包子' },
];

function seededIndex(seed: number, size: number, salt = 0): number {
  if (size < 1) throw new Error('Cannot choose from an empty collection');
  const value = Math.imul((seed ^ salt) >>> 0, 1664525) + 1013904223;
  return (value >>> 0) % size;
}

function createInitialUndercoverState(players: UndercoverPlayerInput[], options: UndercoverSetupOptions): UndercoverState {
  if (players.length !== 6) throw new Error('Undercover requires exactly six players');
  if (new Set(players.map((player) => player.id)).size !== players.length) throw new Error('Undercover player ids must be unique');

  const wordPair = options.wordPair || UNDERCOVER_WORD_PAIRS[seededIndex(options.seed, UNDERCOVER_WORD_PAIRS.length)];
  const fallbackPlayerId = players[seededIndex(options.seed, players.length, 1)].id;
  const undercoverPlayerId = players.some((player) => player.id === options.undercoverPlayerId)
    ? options.undercoverPlayerId!
    : fallbackPlayerId;

  return {
    id: `undercover-${options.seed}`,
    status: 'setup',
    round: 1,
    seed: options.seed,
    wordPair: { ...wordPair },
    undercoverPlayerId,
    playerWords: Object.fromEntries(players.map((player) => [player.id, player.id === undercoverPlayerId ? wordPair.undercover : wordPair.civilian])),
    players: players.map((player) => ({ ...player, alive: true })),
    speeches: [],
    votes: {},
    runoffCandidateIds: [],
  };
}

function getLegalVoteTargets(state: UndercoverState, voterId: number, runoffCandidateIds: number[] = state.runoffCandidateIds): number[] {
  const voter = state.players.find((player) => player.id === voterId);
  if (!voter?.alive) return [];
  const candidates = runoffCandidateIds.length ? new Set(runoffCandidateIds) : null;
  return state.players
    .filter((player) => player.alive && player.id !== voterId && (!candidates || candidates.has(player.id)))
    .map((player) => player.id);
}

function resolveVote(state: UndercoverState, votes: Record<string, number>, isRunoff: boolean): VoteResolution {
  const tally = new Map<number, number>();
  const candidates = isRunoff && state.runoffCandidateIds.length ? state.runoffCandidateIds : undefined;

  for (const voter of state.players.filter((player) => player.alive)) {
    const legalTargets = getLegalVoteTargets(state, voter.id, candidates);
    if (!legalTargets.length) continue;
    const submittedTargetId = votes[String(voter.id)];
    const targetId = legalTargets.includes(submittedTargetId)
      ? submittedTargetId
      : legalTargets[seededIndex(state.seed, legalTargets.length, (Math.imul(state.round, 31) ^ Math.imul(voter.id, 131) ^ (isRunoff ? 1 : 0)))];
    tally.set(targetId, (tally.get(targetId) || 0) + 1);
  }

  const resultTally = Object.fromEntries([...tally.entries()].sort(([left], [right]) => left - right));
  const highestVoteCount = Math.max(...tally.values());
  if (!Number.isFinite(highestVoteCount)) return { kind: 'none', tally: resultTally };

  const candidateIds = [...tally.entries()]
    .filter(([, count]) => count === highestVoteCount)
    .map(([playerId]) => playerId)
    .sort((left, right) => left - right);

  if (candidateIds.length > 1 && !isRunoff) return { kind: 'runoff', candidateIds, tally: resultTally };
  return {
    kind: 'eliminate',
    playerId: candidateIds[seededIndex(state.seed, candidateIds.length, state.round)],
    tally: resultTally,
  };
}

function eliminatePlayer(state: UndercoverState, playerId: number, round: number): UndercoverState {
  return {
    ...state,
    wordPair: { ...state.wordPair },
    playerWords: { ...state.playerWords },
    players: state.players.map((player) => player.id === playerId ? { ...player, alive: false, eliminatedRound: round } : { ...player }),
    speeches: state.speeches.map((speech) => ({ ...speech })),
    votes: { ...state.votes },
    runoffCandidateIds: [...state.runoffCandidateIds],
  };
}

function checkWinner(state: UndercoverState): { winner: 'civilians' | 'undercover'; reason: string } | null {
  const undercoverAlive = state.players.some((player) => player.id === state.undercoverPlayerId && player.alive);
  if (!undercoverAlive) return { winner: 'civilians', reason: '卧底被淘汰' };
  if (state.players.filter((player) => player.alive).length <= 3) return { winner: 'undercover', reason: '卧底存活至最后三人' };
  return null;
}

function containsSecretWord(text: string, secretWord: string): boolean {
  return Boolean(secretWord.trim()) && text.toLocaleLowerCase().includes(secretWord.trim().toLocaleLowerCase());
}

function validatePublicSpeech(text: string, wordPair: UndercoverWordPair): { ok: true; text: string } | { ok: false; reason: 'secret-leak' } {
  const speech = text.trim().slice(0, 120);
  if (!speech || containsSecretWord(speech, wordPair.civilian) || containsSecretWord(speech, wordPair.undercover)) return { ok: false, reason: 'secret-leak' };
  return { ok: true, text: speech };
}

export {
  UNDERCOVER_WORD_PAIRS,
  checkWinner,
  containsSecretWord,
  createInitialUndercoverState,
  eliminatePlayer,
  getLegalVoteTargets,
  resolveVote,
  seededIndex,
  validatePublicSpeech,
};
