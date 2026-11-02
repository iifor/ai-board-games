import { sql } from 'kysely';
import type { Db } from '../../db/database';

/** request_windows 表：限流与锁定的时间点记录 */
export function createRequestWindowRepository(db: Db) {
  return {
    async count(key: string, since: Date): Promise<number> {
      const row = await db.selectFrom('requestWindows').select((eb) => eb.fn.countAll<string>().as('count'))
        .where('key', '=', key).where('at', '>', since).executeTakeFirstOrThrow();
      return Number(row.count);
    },
    add: async (key: string, at: Date): Promise<void> => {
      await db.insertInto('requestWindows').values({ key, at }).execute();
    },
    /** 一条语句：先删掉 before 之前的过期记录，再插入本次记录（data-modifying CTE，不需要定时任务） */
    addAndPrune: async (key: string, at: Date, before: Date): Promise<void> => {
      await sql`
        with pruned as (delete from request_windows where "at" < ${before})
        insert into request_windows ("key", "at") values (${key}, ${at})`.execute(db);
    },
    clear: async (key: string): Promise<void> => {
      await db.deleteFrom('requestWindows').where('key', '=', key).execute();
    },
    prune: async (before: Date): Promise<void> => {
      await db.deleteFrom('requestWindows').where('at', '<', before).execute();
    },
  };
}

export type RequestWindowRepository = ReturnType<typeof createRequestWindowRepository>;
