import type { AudioRef, GameResult, MatchStatus, StageEvent } from '@battle/shared';

export interface StreamItem {
  readonly event: StageEvent;
  readonly audio: AudioRef | null;
}

export interface StreamState {
  readonly items: readonly StreamItem[];
  readonly status: MatchStatus | null;
  readonly ended: boolean;
  readonly result: GameResult | null;
  readonly error: string | null;
  readonly connected: boolean;
}

export interface PlaybackOptions {
  readonly speed: number;
  readonly paused: boolean;
  readonly muted: boolean;
}

export const SPEEDS = [1, 1.5, 2, 3] as const;
