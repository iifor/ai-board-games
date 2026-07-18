import type { UndercoverPublicState } from '@ai-presenter/shared/types/undercover';

export interface UndercoverViewState {
  game: UndercoverPublicState | null;
  error: string;
  message: string;
}

export type UndercoverStartOptions = { playerIds: number[] } | { replayGameId: string };

export type { UndercoverPublicState };
