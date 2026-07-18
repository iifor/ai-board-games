interface UndercoverPublicPlayer {
  id: number;
  nickname: string;
  avatar?: string;
  alive: boolean;
  eliminatedRound?: number;
}

interface UndercoverSpeech {
  round: number;
  playerId: number;
  text: string;
}

interface UndercoverVoteResult {
  round: number;
  runoff: boolean;
  votes: Record<string, number>;
  tally: Record<string, number>;
  tiedCandidateIds: number[];
  eliminatedPlayerId?: number;
}

interface UndercoverReveal {
  civilianWord: string;
  undercoverWord: string;
  undercoverPlayerId: number;
}

interface UndercoverPublicState {
  id: string;
  gameType: 'undercover';
  mode: 'standard-6';
  status: 'setup' | 'speaking' | 'voting' | 'completed';
  round: number;
  players: UndercoverPublicPlayer[];
  speeches: UndercoverSpeech[];
  voteResult?: UndercoverVoteResult;
  winner?: 'civilians' | 'undercover';
  winReason?: string;
  reveal?: UndercoverReveal;
}

export type {
  UndercoverPublicPlayer,
  UndercoverPublicState,
  UndercoverReveal,
  UndercoverSpeech,
  UndercoverVoteResult,
};
