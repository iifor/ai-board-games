import type { AudioRef, GameResult, MatchStatus, StageEvent } from '@battle/shared';

export interface StreamItem {
  readonly event: StageEvent;
  readonly audio: AudioRef | null;
}

/**
 * 连接状态：connecting 正在连接或等待自动重连；open 已连上；
 * lost 自动重连已放弃，等用户手动重试；closed 播放流已结束，不再连接
 */
export type StreamConnection = 'connecting' | 'open' | 'lost' | 'closed';

export interface StreamState {
  readonly items: readonly StreamItem[];
  readonly status: MatchStatus | null;
  readonly ended: boolean;
  readonly result: GameResult | null;
  readonly error: string | null;
  readonly connection: StreamConnection;
}

export interface PlaybackOptions {
  readonly speed: number;
  readonly paused: boolean;
  readonly muted: boolean;
}

export const SPEEDS = [1, 1.5, 2, 3] as const;
