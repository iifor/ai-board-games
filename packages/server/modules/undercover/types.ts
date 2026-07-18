import type { UndercoverPublicPlayer, UndercoverSpeech } from '../../../shared/types/undercover';

interface UndercoverWordPair {
  civilian: string;
  undercover: string;
}

interface UndercoverPlayerState extends UndercoverPublicPlayer {}

interface UndercoverState {
  id: string;
  status: 'setup' | 'speaking' | 'voting' | 'completed';
  round: number;
  seed: number;
  wordPair: UndercoverWordPair;
  undercoverPlayerId: number;
  playerWords: Record<string, string>;
  players: UndercoverPlayerState[];
  speeches: UndercoverSpeech[];
  votes: Record<string, number>;
  runoffCandidateIds: number[];
  winner?: 'civilians' | 'undercover';
  winReason?: string;
}

interface UndercoverSetupOptions {
  seed: number;
  wordPair?: UndercoverWordPair;
  undercoverPlayerId?: number;
}

type UndercoverPlayerInput = Pick<UndercoverPublicPlayer, 'id' | 'nickname' | 'avatar'>;

type VoteResolution =
  | { kind: 'none'; tally: Record<string, number> }
  | { kind: 'runoff'; candidateIds: number[]; tally: Record<string, number> }
  | { kind: 'eliminate'; playerId: number; tally: Record<string, number> };

export type {
  UndercoverPlayerInput,
  UndercoverPlayerState,
  UndercoverSetupOptions,
  UndercoverState,
  UndercoverWordPair,
  VoteResolution,
};
