import type { AvalonPublicState } from '@ai-presenter/shared/types/avalon';
import type { SpeechState } from '../../types';

interface AvalonHost {
  id?: string | number;
  nickname: string;
  avatar?: string;
  avatarUrl?: string;
}

interface AvalonViewState {
  game: AvalonPublicState | null;
  host: AvalonHost | null;
  activeSpeech: SpeechState | null;
  message: string;
  error: string;
}

type AvalonStartOptions = { playerIds: number[]; debugMode?: boolean } | { replayGameId: string };

export type { AvalonHost, AvalonPublicState, AvalonStartOptions, AvalonViewState };
