import type { CompiledGame } from '@battle/engine';
import type { AiCallDto, MatchDetailDto, MatchSummaryDto } from '@battle/shared';
import type { Selectable } from 'kysely';
import type { AiCallsTable } from '../../db/schema';
import type { MatchRow, SeatRow } from './types';

export function toSummary(row: MatchRow, seats: readonly SeatRow[], game: CompiledGame | null): MatchSummaryDto {
  const variant = row.variantKey ? game?.spec.variants?.[row.variantKey] : undefined;
  return {
    id: row.id,
    gameKey: row.gameKey,
    gameTitle: game?.spec.title ?? row.gameKey,
    variantKey: row.variantKey,
    variantName: variant?.name ?? null,
    // 游戏已不在注册表时退回通用的环形布局，前端仍能渲染
    layout: game?.spec.presentation.layout ?? 'circle',
    status: row.status,
    debug: row.debug,
    scripted: row.scripted,
    seats: seats.map((seat) => ({ seat: seat.seat, playerId: seat.playerId, name: seat.playerName })),
    result: row.result,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export function toDetail(row: MatchRow, seats: readonly SeatRow[], game: CompiledGame | null): MatchDetailDto {
  return {
    ...toSummary(row, seats, game),
    pacing: row.pacing,
    lastSeq: row.lastSeq,
    ackedSeq: row.ackedSeq,
    error: row.error,
    phaseId: row.snapshot.cursor.phaseId,
  };
}

export function toAiCall(row: Selectable<AiCallsTable>): AiCallDto {
  return {
    id: row.id,
    requestId: row.requestId,
    seat: row.seat,
    modelName: row.modelName,
    prompt: row.prompt as Record<string, string>,
    rawResponse: row.rawResponse,
    output: row.output,
    error: row.error,
    latencyMs: row.latencyMs,
    createdAt: row.createdAt.toISOString(),
  };
}
