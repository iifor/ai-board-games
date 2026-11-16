import type { ForgetMemoryResult } from '@battle/shared';
import { sql, type Transaction } from 'kysely';
import type { Db } from '../../db/database';
import type { Database } from '../../db/schema';
import { notFound } from '../../utils/errors';

/** 遗忘：清除正文、证据及关联人物，保留编号和版本关系，忘记最新版后不会重新取回旧版 */
const ERASED = {
  forgotten: true, content: '', evidence: '[]', requestId: null,
  subjectId: null, subjectName: null, phaseId: null, action: null, outcome: 'unresolved',
} as const;

/**
 * 删除对局前在同一事务中调用：这局产生、且修正了其他对局记忆的记忆改为遗忘墓碑并解除与对局的关联，
 * 删除后被修正（多为被推翻）的旧记忆仍然隐藏，与忘记最新版同一口径；其余记忆随对局级联删除。
 */
export async function retireMatchMemories(tx: Transaction<Database>, matchId: string): Promise<void> {
  await tx.updateTable('playerMemories').set({ ...ERASED, matchId: null }).where('matchId', '=', matchId)
    .where('previousId', 'in', (eb) => eb.selectFrom('playerMemories as earlier').select('earlier.id').where('earlier.matchId', '<>', matchId))
    .execute();
}

export function memoryEraser(db: Db) {
  return async function forget(ownerId: number, memoryId?: number): Promise<ForgetMemoryResult> {
    return db.transaction().execute(async tx => {
      const owner = await tx.selectFrom('players').select('id').where('id', '=', ownerId).forNoKeyUpdate().executeTakeFirst();
      if (!owner) throw notFound('玩家');
      let cancelled = 0;
      let affected = tx.updateTable('playerMemories').where('ownerId', '=', ownerId).where('forgotten', '=', false);
      if (memoryId !== undefined) {
        const item = await tx.selectFrom('playerMemories').select('id').where('ownerId', '=', ownerId).where('id', '=', memoryId).executeTakeFirst();
        if (!item) throw notFound('记忆');
        affected = affected.where('id', '=', memoryId);
      } else {
        await tx.updateTable('players').set({ memoryGeneration: sql`memory_generation + 1` }).where('id', '=', ownerId).execute();
        const jobs = await tx.updateTable('playerMemoryReviews').set({ status: 'cancelled' }).where('ownerId', '=', ownerId)
          .where('status', 'in', ['queued', 'running']).executeTakeFirst();
        cancelled = Number(jobs.numUpdatedRows);
      }
      const erased = await affected.set(ERASED).executeTakeFirst();
      return { forgotten: Number(erased.numUpdatedRows), cancelledReviews: cancelled };
    });
  };
}
