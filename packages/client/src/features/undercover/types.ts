import type { SpeechState } from '../../types';
import type { UndercoverPublicState, UndercoverVoteResult } from '@ai-presenter/shared/types/undercover';

export interface UndercoverHost {
  id?: string | number;
  name?: string;
  nickname?: string;
  avatar?: string;
  avatarUrl?: string;
}

export interface UndercoverViewState {
  game: UndercoverPublicState | null;
  host: UndercoverHost | null;
  activeSpeech: SpeechState | null;
  error: string;
  message: string;
}

export type UndercoverStartOptions = { playerIds: number[] } | { replayGameId: string };

export type { UndercoverPublicState, UndercoverVoteResult };
