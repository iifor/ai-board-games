import type { AiRequest, EngineSnapshot } from '@battle/engine';
import type { GameResult, MatchPacing, MatchStatus, StageEvent } from '@battle/shared';

export interface MatchRow {
  readonly id: string;
  readonly gameKey: string;
  readonly variantKey: string | null;
  readonly status: MatchStatus;
  readonly debug: boolean;
  readonly scripted: boolean;
  /** 脚本化调试局是否使用混沌脚本 */
  readonly chaos: boolean;
  readonly pacing: MatchPacing;
  readonly snapshot: EngineSnapshot;
  readonly version: number;
  readonly lastSeq: number;
  readonly ackedSeq: number;
  readonly result: GameResult | null;
  readonly error: string | null;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
}

export interface SeatRow {
  readonly seat: number;
  readonly playerId: number | null;
  readonly playerName: string;
  readonly modelId: number | null;
  readonly voiceId: number | null;
}

/** AI worker 完成任务后与推进一起提交 */
export interface TaskCompletion {
  readonly requestId: string;
  readonly status: 'succeeded' | 'failed' | 'cancelled';
  readonly output: unknown;
  readonly error: string | null;
}

export interface AdvanceOutcome {
  readonly status: MatchStatus;
  readonly events: readonly StageEvent[];
  readonly tasks: readonly AiRequest[];
  /** 输入已过期（如阶段已被跳转），未产生任何变化 */
  readonly stale: boolean;
}

export const TERMINAL_STATUSES: ReadonlySet<MatchStatus> = new Set(['completed', 'failed']);
/** 观众确认进度之后，引擎最多领先推送的事件数 */
export const PREFETCH_EVENTS = 3;
