import type { GameResult, StageEvent } from '../stage';

export type MatchStatus = 'created' | 'running' | 'waiting_ai' | 'paused' | 'completed' | 'failed';
export type MatchPacing = 'ack' | 'free';

export interface CreateMatchRequest {
  readonly gameKey: string;
  readonly variant?: string | undefined;
  readonly params?: Readonly<Record<string, unknown>> | undefined;
  /** 按座位顺序的玩家 ID */
  readonly playerIds: readonly number[];
}

export interface CreateDebugMatchRequest extends CreateMatchRequest {
  readonly seed?: number | undefined;
  /** 'all' 或阶段 ID 列表；不传则不暂停 */
  readonly breakpoints?: 'all' | readonly string[] | undefined;
  readonly pacing?: MatchPacing | undefined;
  /** true：使用脚本化输出，不调用真实模型与云端 TTS */
  readonly scripted?: boolean | undefined;
}

export interface MatchSeatDto {
  readonly seat: number;
  readonly playerId: number | null;
  readonly name: string;
}

export interface MatchSummaryDto {
  readonly id: string;
  readonly gameKey: string;
  readonly gameTitle: string;
  readonly variantKey: string | null;
  readonly variantName: string | null;
  readonly status: MatchStatus;
  readonly debug: boolean;
  readonly scripted: boolean;
  readonly seats: readonly MatchSeatDto[];
  readonly result: GameResult | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

export interface MatchDetailDto extends MatchSummaryDto {
  readonly pacing: MatchPacing;
  readonly lastSeq: number;
  readonly ackedSeq: number;
  readonly error: string | null;
  /** 调试局当前所在阶段 */
  readonly phaseId: string | null;
}

export interface AiCallDto {
  readonly id: number;
  readonly requestId: string;
  readonly seat: number;
  readonly modelName: string;
  readonly prompt: Readonly<Record<string, string>>;
  readonly rawResponse: string | null;
  readonly output: unknown;
  readonly error: string | null;
  readonly latencyMs: number;
  readonly createdAt: string;
}

export type DebugCommandRequest = { readonly command: 'continue' | 'step' | 'run' | 'skip' };

export interface AudioRef {
  readonly url: string;
  readonly mime: string;
}

/** WebSocket：服务端 → 客户端 */
export type ServerMessage =
  | { readonly type: 'event'; readonly event: StageEvent; readonly audio: AudioRef | null }
  | { readonly type: 'status'; readonly status: MatchStatus; readonly error: string | null }
  | { readonly type: 'end'; readonly result: GameResult | null }
  | { readonly type: 'error'; readonly message: string };

/** WebSocket：客户端 → 服务端。hello 指定从哪个 seq 之后开始推送；每个事件播放完毕后 ack */
export type ClientMessage =
  | { readonly type: 'hello'; readonly afterSeq: number }
  | { readonly type: 'ack'; readonly seq: number };

/** 调试台展示的阶段图 */
export interface PhaseNodeDto {
  readonly id: string;
  readonly kind: string;
  readonly title: string | null;
  /** 可能的跳转目标（含 end / return） */
  readonly next: readonly string[];
}

export interface PhaseGraphDto {
  readonly gameKey: string;
  readonly start: string;
  readonly phases: readonly PhaseNodeDto[];
}
