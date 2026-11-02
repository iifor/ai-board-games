import type { AiRequest, EngineSnapshot } from '@battle/engine';
import type { GameResult, MatchPacing, MatchStatus, StageEvent } from '@battle/shared';
import { sql, type Transaction } from 'kysely';
import type { Db } from '../../db/database';
import type { Database } from '../../db/schema';
import { VOICE_CHOICE_COLUMNS } from '../voices/repository';
import type { MatchRow, SeatRow, TaskCompletion } from './types';

type Executor = Db | Transaction<Database>;

/** 公开开局用的事务级 advisory lock 键（任意固定整数，只需全库唯一） */
const PUBLIC_CREATION_LOCK = 7201;
/** 还没有结果的任务状态 */
const OPEN_TASK_STATUSES = ['queued', 'running'] as const;

export interface NewMatch {
  readonly id: string;
  readonly gameKey: string;
  readonly variantKey: string | null;
  readonly specVersion: number;
  readonly specHash: string;
  readonly seed: number;
  readonly params: unknown;
  readonly debug: boolean;
  readonly scripted: boolean;
  readonly pacing: MatchPacing;
  readonly snapshot: EngineSnapshot;
}

const MATCH_COLUMNS = [
  'id', 'gameKey', 'variantKey', 'status', 'debug', 'scripted', 'pacing', 'snapshot', 'version',
  'lastSeq', 'ackedSeq', 'result', 'error', 'createdAt', 'completedAt',
] as const;

function toRow(row: Record<string, unknown>): MatchRow {
  return row as unknown as MatchRow;
}

export function createMatchRepository(db: Db) {
  /** 取消这些对局里还没完成的任务（对局失败或被回收时） */
  const cancelOpenTasks = (trx: Executor, matchIds: readonly string[]) =>
    trx.updateTable('aiTasks').set({ status: 'cancelled', updatedAt: new Date() })
      .where('matchId', 'in', matchIds).where('status', 'in', OPEN_TASK_STATUSES).execute();

  return {
    transaction: <T>(work: (trx: Transaction<Database>) => Promise<T>) => db.transaction().execute(work),

    async insert(trx: Executor, match: NewMatch, seats: readonly SeatRow[]): Promise<void> {
      await trx.insertInto('matches').values({
        ...match,
        params: JSON.stringify(match.params),
        snapshot: JSON.stringify(match.snapshot),
        status: match.snapshot.status,
      }).execute();
      await trx.insertInto('matchSeats').values(seats.map((seat) => ({ ...seat, matchId: match.id }))).execute();
    },

    async lock(trx: Executor, id: string): Promise<MatchRow | undefined> {
      const row = await trx.selectFrom('matches').select(MATCH_COLUMNS).where('id', '=', id).forUpdate().executeTakeFirst();
      return row ? toRow(row) : undefined;
    },

    async find(id: string): Promise<MatchRow | undefined> {
      const row = await db.selectFrom('matches').select(MATCH_COLUMNS).where('id', '=', id).executeTakeFirst();
      return row ? toRow(row) : undefined;
    },

    async list(filter: { readonly debug?: boolean; readonly status?: MatchStatus; readonly limit: number }): Promise<MatchRow[]> {
      let query = db.selectFrom('matches').select(MATCH_COLUMNS).orderBy('createdAt', 'desc').limit(filter.limit);
      if (filter.debug !== undefined) query = query.where('debug', '=', filter.debug);
      if (filter.status) query = query.where('status', '=', filter.status);
      return (await query.execute()).map(toRow);
    },

    async saveAdvance(trx: Executor, id: string, update: {
      readonly snapshot: EngineSnapshot;
      readonly status: MatchStatus;
      readonly lastSeq: number;
      readonly result: GameResult | null;
    }): Promise<void> {
      await trx.updateTable('matches').set({
        snapshot: JSON.stringify(update.snapshot),
        status: update.status,
        version: sql`version + 1`,
        lastSeq: update.lastSeq,
        result: update.result === null ? null : JSON.stringify(update.result),
        updatedAt: new Date(),
        ...(update.status === 'completed' ? { completedAt: new Date() } : {}),
      }).where('id', '=', id).execute();
    },

    markFailed: (trx: Executor, id: string, error: string) =>
      trx.updateTable('matches').set({ status: 'failed', error, updatedAt: new Date() }).where('id', '=', id).execute(),

    async insertTasks(trx: Executor, matchId: string, requests: readonly AiRequest[]): Promise<void> {
      if (!requests.length) return;
      await trx.insertInto('aiTasks')
        .values(requests.map((request) => ({ matchId, requestId: request.id, seat: request.seat, request: JSON.stringify(request) })))
        .execute();
    },

    /** 只有还在排队或执行中的任务才能被完结：迟到的结果不能把已 succeeded 的任务改成 cancelled */
    completeTask: (trx: Executor, matchId: string, task: TaskCompletion) =>
      trx.updateTable('aiTasks').set({
        status: task.status,
        output: task.output === undefined ? null : JSON.stringify(task.output),
        error: task.error,
        claimedUntil: null,
        updatedAt: new Date(),
      }).where('matchId', '=', matchId).where('requestId', '=', task.requestId).where('status', 'in', OPEN_TASK_STATUSES).execute(),

    cancelOpenTasks,

    async insertEvents(trx: Executor, matchId: string, events: readonly StageEvent[]): Promise<void> {
      if (!events.length) return;
      await trx.insertInto('matchStageEvents').values(events.map((event) => ({ matchId, seq: event.seq, event: JSON.stringify(event) }))).execute();
    },

    async nextEvent(matchId: string, afterSeq: number): Promise<StageEvent | undefined> {
      const row = await db.selectFrom('matchStageEvents').select('event').where('matchId', '=', matchId).where('seq', '>', afterSeq)
        .orderBy('seq').limit(1).executeTakeFirst();
      return row?.event as StageEvent | undefined;
    },

    async seats(matchId: string): Promise<SeatRow[]> {
      return db.selectFrom('matchSeats').select(['seat', 'playerId', 'playerName', 'modelId', 'voiceId'])
        .where('matchId', '=', matchId).orderBy('seat').execute();
    },

    /** 座位绑定的、仍启用的音色参数，供对局播放合成语音 */
    seatVoice: (matchId: string, seat: number) =>
      db.selectFrom('matchSeats').innerJoin('voices', 'voices.id', 'matchSeats.voiceId')
        .select(VOICE_CHOICE_COLUMNS.map((column) => `voices.${column}` as const))
        .where('matchSeats.matchId', '=', matchId).where('matchSeats.seat', '=', seat).where('voices.enabled', '=', true)
        .executeTakeFirst(),

    /** 观众确认也算"有人在看"：updated_at 一并刷新，供进行中计数与回收器判断 */
    markAcked: (id: string, seq: number) =>
      db.updateTable('matches').set({ ackedSeq: sql`greatest(acked_seq, ${seq})`, updatedAt: new Date() }).where('id', '=', id).execute(),

    /** 近期有动静的进行中公开对局数；传入事务时与 lockPublicCreation 在同一事务内判断 */
    async countActivePublic(since: Date, executor: Executor = db): Promise<number> {
      const row = await executor.selectFrom('matches').select((eb) => eb.fn.countAll<string>().as('count'))
        .where('debug', '=', false).where('status', 'not in', ['completed', 'failed']).where('updatedAt', '>', since)
        .executeTakeFirstOrThrow();
      return Number(row.count);
    },

    /** 公开开局的事务级串行锁：让"计数 + 插入"不会被并发请求一起越过上限 */
    lockPublicCreation: (trx: Executor) => sql`select pg_advisory_xact_lock(${PUBLIC_CREATION_LOCK})`.execute(trx),

    /** 长时间无人确认的公开对局标为失败，并取消其排队中的 AI 任务；返回被结束的对局 ID */
    async failIdle(before: Date, error: string): Promise<string[]> {
      return db.transaction().execute(async (trx) => {
        const rows = await trx.updateTable('matches')
          .set({ status: 'failed', error, updatedAt: new Date(), completedAt: new Date() })
          .where('debug', '=', false).where('pacing', '=', 'ack')
          .where('status', 'in', ['created', 'running', 'waiting_ai']).where('updatedAt', '<', before)
          .returning('id').execute();
        const ids = rows.map((row) => row.id);
        if (ids.length) await cancelOpenTasks(trx, ids);
        return ids;
      });
    },

    remove: (id: string) => db.deleteFrom('matches').where('id', '=', id).executeTakeFirst(),

    aiCalls: (matchId: string) => db.selectFrom('aiCalls').selectAll().where('matchId', '=', matchId).orderBy('id').execute(),
  };
}

export type MatchRepository = ReturnType<typeof createMatchRepository>;
