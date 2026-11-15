import { sql } from 'kysely';
import type { Db } from '../../db/database';
import type { interpretReview } from './reflection';
import type { SeatModel } from '../ai-worker/repository';
import type { LlmUsage } from '../llm/types';

export interface ReviewJob { matchId: string; ownerId: number; seat: number; attempts: number }

export function reviewRepository(db: Db) {
  return {
    async beginCall(job: ReviewJob, model: SeatModel, isBackup: boolean) {
      return db.transaction().execute(async tx => {
        const active = await tx.selectFrom('playerMemoryReviews').select('seat')
          .where('matchId', '=', job.matchId).where('ownerId', '=', job.ownerId)
          .where('attempts', '=', job.attempts).where('status', '=', 'running').forShare().executeTakeFirst();
        if (!active) return null;
        const row = await tx.insertInto('memoryReviewCalls').values({
          matchId: job.matchId, ownerId: job.ownerId, seat: job.seat, jobAttempt: job.attempts,
          modelId: model.modelId, providerId: model.providerId, model: model.model, isBackup,
          status: 'started', detail: null, latencyMs: null, promptTokens: null, completionTokens: null,
        }).returning('id').executeTakeFirstOrThrow();
        return row.id;
      });
    },
    received: (id: number, latencyMs: number, usage: LlmUsage | null) => db.updateTable('memoryReviewCalls')
      .set({ status: 'received', latencyMs, promptTokens: usage?.promptTokens ?? null, completionTokens: usage?.completionTokens ?? null })
      .where('id', '=', id).execute(),
    failedCall: (id: number, status: 'call_failed' | 'invalid_reply' | 'save_failed', detail: string, latencyMs?: number) =>
      db.updateTable('memoryReviewCalls').set({ status, detail, ...(latencyMs !== undefined && { latencyMs }) }).where('id', '=', id).execute(),
    async claim() {
      const result = await sql<ReviewJob>`
        update player_memory_reviews j set status='running', attempts=j.attempts+1, available_at=now()+interval '3 minutes'
        from (select match_id, owner_id from player_memory_reviews where status in ('queued','running') and available_at<=now()
          order by available_at, match_id, owner_id limit 1 for update skip locked) picked
        where j.match_id=picked.match_id and j.owner_id=picked.owner_id returning j.match_id,j.owner_id,j.seat,j.attempts`.execute(db);
      return result.rows[0];
    },
    attempts: (job: ReviewJob) => db.selectFrom('memoryReviewCalls').select(['status', 'detail', 'modelId'])
      .where('matchId', '=', job.matchId).where('ownerId', '=', job.ownerId).where('jobAttempt', '<=', job.attempts)
      .orderBy('id').execute(),
    async decisions(job: ReviewJob) {
      return (await db.selectFrom('playerDecisions').select('note').where('matchId', '=', job.matchId)
        .where('ownerId', '=', job.ownerId).orderBy(sql`(note->>'round')::int`).orderBy('requestId').execute()).map(r => r.note);
    },
    async forgottenIds(ownerId: number, ids: readonly number[]) {
      if (!ids.length) return new Set<number>();
      const rows = await db.selectFrom('playerMemories').select('id').where('ownerId', '=', ownerId)
        .where('id', 'in', ids).where('forgotten', '=', true).execute();
      return new Set(rows.map(m => m.id));
    },
    async finish(job: ReviewJob, gameKey: string, memories: ReturnType<typeof interpretReview>, callId?: number) {
      await db.transaction().execute(async tx => {
        await tx.selectFrom('players').select('id').where('id', '=', job.ownerId).forShare().execute();
        const claimed = await tx.updateTable('playerMemoryReviews').set({ status: 'done' }).where('matchId', '=', job.matchId)
          .where('ownerId', '=', job.ownerId).where('attempts', '=', job.attempts).where('status', '=', 'running').executeTakeFirst();
        if (callId !== undefined) await tx.updateTable('memoryReviewCalls').set({ status: claimed.numUpdatedRows ? 'saved' : 'superseded' })
          .where('id', '=', callId).execute();
        if (!claimed.numUpdatedRows || !memories.length) return;
        for (const m of memories) {
          // 被删除的来源局可以让旧版本消失，此次仍保留有独立证据的新观察。
          const previous = m.previousId === null ? null : await tx.selectFrom('playerMemories').select(['id', 'forgotten'])
            .where('id', '=', m.previousId).where('ownerId', '=', job.ownerId).forKeyShare().executeTakeFirst();
          if (previous?.forgotten) continue;
          await tx.insertInto('playerMemories').values({ ...m, previousId: previous?.id ?? null,
            ownerId: job.ownerId, matchId: job.matchId, gameKey, evidence: JSON.stringify(m.evidence) }).execute();
        }
      });
    },
    retry: (job: ReviewJob, terminal = false) => db.updateTable('playerMemoryReviews').set({
      status: terminal || job.attempts >= 3 ? 'failed' : 'queued', availableAt: new Date(Date.now() + job.attempts * 30_000),
    }).where('matchId', '=', job.matchId).where('ownerId', '=', job.ownerId).where('attempts', '=', job.attempts)
      .where('status', '=', 'running').execute(),
  };
}
