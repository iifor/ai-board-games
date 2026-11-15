import type { AiCallDto, MatchSeatDto, MatchStatus } from './matches';
import type { StageEvent } from '../stage';
import type { MemoryCard, MemoryDecision } from './playerMemory';

export type TraceKind = 'phase' | 'request' | 'decision' | 'settlement' | 'stage' | 'log' | 'control' | 'failure';

export interface TraceMark {
  readonly kind: TraceKind;
  readonly label: string;
  readonly round: number;
  readonly phaseId: string | null;
  readonly visit: number;
  readonly seat: number | null;
  readonly seq: number | null;
  /** 直接参与该节点的 AI 请求，包括并行计票的每一张票。 */
  readonly requestIds: readonly string[];
  readonly data: unknown;
}

export interface TraceNodeDto extends Omit<TraceMark, 'data'> {
  readonly id: number;
  readonly createdAt: string;
  /** 触发本次推进的请求，可能只是并行批次中最后返回的一个。 */
  readonly inputRequestId: string | null;
}

export interface TraceMatchDto {
  readonly id: string;
  readonly gameKey: string;
  readonly variantKey: string | null;
  readonly status: MatchStatus;
  readonly scripted: boolean;
  readonly createdAt: string;
}

export interface ModelUsageDto {
  readonly modelName: string;
  readonly calls: number;
  readonly failures: number;
  readonly measured: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
}

export interface MatchTraceDto {
  readonly match: TraceMatchDto & {
    readonly seats: readonly MatchSeatDto[]; readonly error: string | null;
    readonly roleNames?: Readonly<Record<string, string>>;
  };
  readonly nodes: readonly TraceNodeDto[];
  readonly models: readonly ModelUsageDto[];
  readonly calls: readonly Pick<AiCallDto, 'id' | 'requestId' | 'modelName' | 'seat' | 'latencyMs' | 'createdAt' | 'error'>[];
}

export interface TraceRequestDto {
  readonly memory?: { readonly offered: readonly MemoryCard[]; readonly decision: MemoryDecision | null };
  readonly id: string;
  readonly seat: number;
  readonly action: string;
  readonly attempt: number;
  readonly legalTargets: readonly number[] | null;
  readonly prompt: Readonly<Record<string, string>>;
  readonly messages: readonly { readonly role: string; readonly content: string }[];
  readonly outputSchema: unknown;
  readonly status: string;
  readonly output: unknown;
  readonly error: string | null;
  readonly calls: readonly (AiCallDto & {
    readonly usage: { readonly promptTokens: number; readonly completionTokens: number } | null;
    readonly settings: TraceModelSettings | null;
  })[];
}

export interface TraceModelSettings {
  readonly model: string;
  readonly providerId: number;
  readonly temperature: number;
  readonly maxTokens: number;
}

export interface TraceNodeDetailDto {
  readonly data: unknown;
  readonly event: StageEvent | null;
  readonly requests: readonly TraceRequestDto[];
}
