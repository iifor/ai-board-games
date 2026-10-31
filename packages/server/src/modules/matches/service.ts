import { randomInt, randomUUID } from 'node:crypto';
import { createSnapshot, EngineInputError, type CompiledGame, type LogEntry, type SeatProfile } from '@battle/engine';
import type { AiCallDto, CreateDebugMatchRequest, CreateMatchRequest, MatchDetailDto, MatchStatus, MatchSummaryDto } from '@battle/shared';
import { badRequest, notFound, tooManyRequests } from '../../utils/errors';
import type { PlayerRepository } from '../players/repository';
import type { CreationLimiter } from './limits';
import { toAiCall, toDetail, toSummary } from './mapper';
import type { MatchRepository } from './repository';
import type { MatchRuntime } from './runtime';
import type { SeatRow } from './types';

const ACTIVE_WINDOW_MS = 30 * 60 * 1000;

export interface MatchServiceDeps {
  readonly repository: MatchRepository;
  readonly players: PlayerRepository;
  readonly runtime: MatchRuntime;
  readonly findGame: (key: string) => CompiledGame;
  readonly tryGame: (key: string) => CompiledGame | null;
  readonly limiter: CreationLimiter;
  readonly maxActive: number;
}

export function createMatchService(deps: MatchServiceDeps) {
  const { repository } = deps;

  async function seatsFor(playerIds: readonly number[]): Promise<{ profiles: SeatProfile[]; seats: SeatRow[] }> {
    const rows = await deps.players.findMany(playerIds);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const ordered = playerIds.map((id) => byId.get(id));
    const missing = playerIds.filter((id, index) => !ordered[index]?.enabled);
    if (missing.length) throw badRequest(`玩家不存在或已停用：${missing.join('、')}`);
    const players = ordered.filter((row): row is NonNullable<typeof row> => row !== undefined);
    return {
      profiles: players.map((row) => ({ playerId: String(row.id), name: row.name, persona: row.persona, avatar: row.avatar })),
      seats: players.map((row, index) => ({ seat: index + 1, playerId: row.id, playerName: row.name, modelId: row.modelId, voiceId: row.voiceId })),
    };
  }

  async function create(request: CreateMatchRequest, debug: CreateDebugMatchRequest | null): Promise<MatchSummaryDto> {
    const game = deps.findGame(request.gameKey);
    const { profiles, seats } = await seatsFor(request.playerIds);
    const seed = debug?.seed ?? randomInt(0, 2 ** 32);
    let snapshot;
    try {
      snapshot = createSnapshot(game, {
        seed,
        players: profiles,
        params: request.params,
        ...(request.variant ? { variant: request.variant } : {}),
        ...(debug ? { debug: { breakpoints: debug.breakpoints ?? [] } } : {}),
      });
    } catch (error) {
      if (error instanceof EngineInputError) throw badRequest(error.message);
      throw error;
    }
    const id = `m_${randomUUID()}`;
    await repository.transaction((trx) => repository.insert(trx, {
      id,
      gameKey: game.spec.key,
      variantKey: snapshot.variantKey,
      specVersion: game.spec.version,
      specHash: game.hash,
      seed,
      params: snapshot.params,
      debug: debug !== null,
      scripted: debug?.scripted ?? false,
      pacing: debug?.pacing ?? 'ack',
      snapshot,
    }, seats));
    await deps.runtime.advanceMatch(id, { kind: 'start' });
    return summary(id);
  }

  async function load(id: string) {
    const row = await repository.find(id);
    if (!row) throw notFound('对局');
    return { row, seats: await repository.seats(id), game: deps.tryGame(row.gameKey) };
  }

  async function summary(id: string): Promise<MatchSummaryDto> {
    const { row, seats, game } = await load(id);
    return toSummary(row, seats, game);
  }

  return {
    /** C 端开局：限流 + 同时进行的公开对局数上限 */
    async createPublic(request: CreateMatchRequest, source: string): Promise<MatchSummaryDto> {
      deps.limiter.check(source);
      if ((await repository.countActivePublic(new Date(Date.now() - ACTIVE_WINDOW_MS))) >= deps.maxActive) {
        throw tooManyRequests('当前进行中的对局较多，请稍后再试');
      }
      return create(request, null);
    },

    createDebug: (request: CreateDebugMatchRequest) => create(request, request),
    summary,

    async detail(id: string): Promise<MatchDetailDto> {
      const { row, seats, game } = await load(id);
      return toDetail(row, seats, game);
    },

    async list(filter: { readonly debug?: boolean; readonly status?: MatchStatus; readonly limit: number }): Promise<MatchSummaryDto[]> {
      const rows = await repository.list(filter);
      return Promise.all(rows.map(async (row) => toSummary(row, await repository.seats(row.id), deps.tryGame(row.gameKey))));
    },

    /** 后台查看完整日志（包含私密频道与兜底记录） */
    async log(id: string): Promise<readonly LogEntry[]> {
      return (await load(id)).row.snapshot.log;
    },

    async aiCalls(id: string): Promise<AiCallDto[]> {
      await load(id);
      return (await repository.aiCalls(id)).map(toAiCall);
    },

    async debugCommand(id: string, command: 'continue' | 'step' | 'run' | 'skip'): Promise<MatchDetailDto> {
      await deps.runtime.advanceMatch(id, { kind: 'debug', command });
      const { row, seats, game } = await load(id);
      return toDetail(row, seats, game);
    },

    async remove(id: string): Promise<void> {
      const result = await repository.remove(id);
      if (result.numDeletedRows === 0n) throw notFound('对局');
    },
  };
}

export type MatchService = ReturnType<typeof createMatchService>;
