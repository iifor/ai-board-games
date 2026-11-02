import type { AiRequest } from '@battle/engine';
import { sql } from 'kysely';
import type { Db } from '../../db/database';

export interface ClaimedTask {
  readonly matchId: string;
  readonly requestId: string;
  readonly seat: number;
  readonly request: AiRequest;
}

export interface SeatModel {
  readonly modelId: number;
  readonly name: string;
  readonly model: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly providerId: number;
  readonly fallbackModelId: number | null;
  /** 停用的主模型不再调用，但仍要据此找到它的备用模型 */
  readonly enabled: boolean;
}

/** 必须大于单个任务的最长耗时（2 个模型 × 2 次 × 60 秒超时 + 退避），否则会被重复领取、重复调用模型 */
const CLAIM_TTL = '10 minutes';

export function createAiTaskRepository(db: Db) {
  async function modelById(id: number): Promise<SeatModel | undefined> {
    return db.selectFrom('models')
      .select(['id as modelId', 'name', 'model', 'temperature', 'maxTokens', 'providerId', 'fallbackModelId', 'enabled'])
      .where('id', '=', id).executeTakeFirst();
  }

  return {
    /**
     * 原子领取任务（SKIP LOCKED，多实例不会重复领取；领取过期后可被重新领取）。
     * ack 节奏的对局只在观众未确认的事件不超过 prefetch 时才继续生成，无人观看时自然停止消耗。
     */
    async claim(limit: number, prefetch: number): Promise<ClaimedTask[]> {
      const result = await sql<ClaimedTask>`
        update ai_tasks t set status = 'running', claimed_until = now() + ${CLAIM_TTL}::interval, updated_at = now()
        from (
          select t2.match_id, t2.request_id from ai_tasks t2
          join matches m on m.id = t2.match_id
          where (t2.status = 'queued' or (t2.status = 'running' and t2.claimed_until < now()))
            and m.status = 'waiting_ai'
            and (m.pacing = 'free' or (
              select count(*) from match_stage_events e where e.match_id = m.id and e.seq > m.acked_seq
            ) <= ${prefetch})
          order by t2.created_at
          limit ${limit}
          for update of t2 skip locked
        ) picked
        where t.match_id = picked.match_id and t.request_id = picked.request_id
        returning t.match_id as "matchId", t.request_id as "requestId", t.seat, t.request`.execute(db.withoutPlugins());
      return result.rows;
    },

    async seatModel(matchId: string, seat: number): Promise<SeatModel | undefined> {
      const row = await db.selectFrom('matchSeats').select('modelId').where('matchId', '=', matchId).where('seat', '=', seat).executeTakeFirst();
      return row?.modelId ? modelById(row.modelId) : undefined;
    },

    modelById,

    recordCall: (values: {
      matchId: string;
      requestId: string;
      seat: number;
      modelId: number | null;
      modelName: string;
      prompt: unknown;
      rawResponse: string | null;
      output: unknown;
      error: string | null;
      latencyMs: number;
      usage: unknown;
    }) => db.insertInto('aiCalls').values({
      ...values,
      prompt: JSON.stringify(values.prompt),
      output: values.output === undefined ? null : JSON.stringify(values.output),
      usage: values.usage === null ? null : JSON.stringify(values.usage),
    }).execute(),
  };
}

export type AiTaskRepository = ReturnType<typeof createAiTaskRepository>;
