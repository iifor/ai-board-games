import { sql, type Transaction } from 'kysely';
import type { Db } from '../../db/database';
import type { Database } from '../../db/schema';
import type { AccessCodeRow, AccessCodeValues } from './types';

type Executor = Db | Transaction<Database>;

export function createAccessCodeRepository(db: Db) {
  return {
    list: (): Promise<AccessCodeRow[]> => db.selectFrom('accessCodes').selectAll().orderBy('id', 'desc').execute(),

    find: (id: number, executor: Executor = db): Promise<AccessCodeRow | undefined> =>
      executor.selectFrom('accessCodes').selectAll().where('id', '=', id).executeTakeFirst(),

    findByHash: (codeHash: string): Promise<AccessCodeRow | undefined> =>
      db.selectFrom('accessCodes').selectAll().where('codeHash', '=', codeHash).executeTakeFirst(),

    insert: (values: AccessCodeValues & { codeHash: string; codeHint: string; createdBy: number | null }): Promise<AccessCodeRow> =>
      db.insertInto('accessCodes').values(values).returningAll().executeTakeFirstOrThrow(),

    update: (id: number, values: AccessCodeValues): Promise<AccessCodeRow | undefined> =>
      db.updateTable('accessCodes').set({ ...values, updatedAt: new Date() }).where('id', '=', id).returningAll().executeTakeFirst(),

    /** 换一个新码：generation 递增，旧码换来的凭证随之失效 */
    rotate: (id: number, codeHash: string, codeHint: string): Promise<AccessCodeRow | undefined> =>
      db.updateTable('accessCodes').set({ codeHash, codeHint, generation: sql`generation + 1`, updatedAt: new Date() })
        .where('id', '=', id).returningAll().executeTakeFirst(),

    async remove(id: number): Promise<boolean> {
      const result = await db.deleteFrom('accessCodes').where('id', '=', id).executeTakeFirst();
      return Number(result.numDeletedRows) > 0;
    },

    /**
     * 记一次开局：条件判断与计数在同一条 UPDATE 里完成，并发开局不会越过局数上限。
     * 没有命中（已停用、已过期、已重新生成或已用完）返回 false，由调用方区分原因。
     */
    async consume(executor: Executor, id: number, generation: number, at: Date): Promise<boolean> {
      const row = await executor.updateTable('accessCodes')
        .set({ usedMatches: sql`used_matches + 1`, lastUsedAt: at })
        .where('id', '=', id).where('generation', '=', generation).where('disabled', '=', false).where('expiresAt', '>', at)
        .where(sql<boolean>`(max_matches is null or used_matches < max_matches)`)
        .returning('id').executeTakeFirst();
      return row !== undefined;
    },
  };
}

export type AccessCodeRepository = ReturnType<typeof createAccessCodeRepository>;
