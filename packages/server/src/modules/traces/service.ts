import { toChatMessages, type AiRequest } from '@battle/engine';
import type { LlmUsage } from '../llm';
import type { MatchStatus, MatchTraceDto, StageEvent, TraceMatchDto, TraceNodeDetailDto } from '@battle/shared';
import { notFound } from '../../utils/errors';
import { toAiCall } from '../matches/mapper';
import type { TraceRepository } from './repository';

function matchDto(row: Omit<TraceMatchDto, 'status' | 'createdAt'> & { status: string; createdAt: Date }): TraceMatchDto {
  return { id: row.id, gameKey: row.gameKey, variantKey: row.variantKey, scripted: row.scripted,
    status: row.status as MatchStatus, createdAt: row.createdAt.toISOString() };
}

export function createTraceService(repository: TraceRepository) {
  return {
    async remove(matchId: string) {
      if (!await repository.remove(matchId)) throw notFound('对局');
    },
    async list(filter: Parameters<TraceRepository['list']>[0]) {
      return (await repository.list(filter)).map(matchDto);
    },
    async overview(matchId: string): Promise<MatchTraceDto> {
      const result = await repository.overview(matchId);
      if (!result) throw notFound('对局');
      return {
        match: { ...matchDto(result.match), error: result.match.error, seats: result.seats },
        nodes: result.nodes.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
        models: result.models,
        calls: result.calls.map((call) => ({ ...call, createdAt: call.createdAt.toISOString() })),
      };
    },
    async node(matchId: string, id: number): Promise<TraceNodeDetailDto> {
      const result = await repository.node(matchId, id);
      if (!result) throw notFound('调用链节点');
      return {
        data: result.data, event: result.event as StageEvent | null,
        requests: result.tasks.map((task) => {
          const request = task.request as AiRequest;
          return {
            id: request.id, seat: request.seat, action: request.action, attempt: request.attempt,
            prompt: { ...request.prompt }, messages: toChatMessages(request.prompt), legalTargets: request.legalTargets, outputSchema: request.outputSchema,
            status: task.status, output: task.output, error: task.error,
            calls: result.calls.filter((call) => call.requestId === task.requestId).map((call) => ({
              ...toAiCall(call), settings: call.traceSettings, usage: call.usage as LlmUsage | null,
            })),
          };
        }),
      };
    },
  };
}

export type TraceService = ReturnType<typeof createTraceService>;
