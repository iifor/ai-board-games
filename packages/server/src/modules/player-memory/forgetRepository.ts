import type { ForgetMemoryResult } from '@battle/shared';
import { sql } from 'kysely';
import type { Db } from '../../db/database';
import { notFound } from '../../utils/errors';

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
      // 保留版本间的编号关系，忘记最新版后不会重新取回旧版。清除正文、证据及关联人物。
      const erased = await affected.set({ forgotten: true, content: '', evidence: '[]', requestId: null,
        subjectId: null, subjectName: null, phaseId: null, action: null, outcome: 'unresolved' }).executeTakeFirst();
      return { forgotten: Number(erased.numUpdatedRows), cancelledReviews: cancelled };
    });
  };
}
