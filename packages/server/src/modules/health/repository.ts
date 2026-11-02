import { sql } from 'kysely';
import type { Db } from '../../db/database';

export function createHealthRepository(db: Db) {
  return {
    /** 最轻量的连通性检查；数据库不可用时抛出 */
    ping: async (): Promise<void> => {
      await sql`select 1`.execute(db);
    },
  };
}

export type HealthRepository = ReturnType<typeof createHealthRepository>;
