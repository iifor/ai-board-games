import type { Transaction } from 'kysely';
import type { Db } from '../../db/database';
import { JOB_LOCKS, jobLock } from '../../db/locks';
import type { Database } from '../../db/schema';

type Executor = Db | Transaction<Database>;

export function createAuthRepository(db: Db) {
  return {
    transaction: <T>(work: (trx: Transaction<Database>) => Promise<T>) => db.transaction().execute(work),
    /** 初始管理员创建的事务级锁：多实例同时启动时只有一个会插入 */
    lockBootstrap: (trx: Transaction<Database>) => jobLock(trx, JOB_LOCKS.adminBootstrap),
    count: async (executor: Executor = db): Promise<number> => {
      const row = await executor.selectFrom('adminUsers').select((eb) => eb.fn.countAll<string>().as('count')).executeTakeFirstOrThrow();
      return Number(row.count);
    },
    findByUsername: (username: string) =>
      db.selectFrom('adminUsers').selectAll().where('username', '=', username).executeTakeFirst(),
    findById: (id: number) => db.selectFrom('adminUsers').selectAll().where('id', '=', id).executeTakeFirst(),
    create: (username: string, passwordHash: string, executor: Executor = db) =>
      executor.insertInto('adminUsers').values({ username, passwordHash, mustChangePassword: true }).returning('id').executeTakeFirstOrThrow(),
    updatePassword: (id: number, passwordHash: string) =>
      db.updateTable('adminUsers').set({ passwordHash, mustChangePassword: false, updatedAt: new Date() }).where('id', '=', id).execute(),
  };
}

export type AuthRepository = ReturnType<typeof createAuthRepository>;
