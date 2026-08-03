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

export type UndercoverPlaybackRate = 1 | 2 | 4;

export type UndercoverStartOptions =
  | { playerIds: number[]; debugMode?: boolean }
  | { replayGameId: string };

export type { UndercoverPublicState, UndercoverVoteResult };
