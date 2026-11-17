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
    /** 改密同时递增令牌代次，返回新代次：此前签发的令牌全部失效 */
    updatePassword: async (id: number, passwordHash: string): Promise<number> => {
      const row = await db.updateTable('adminUsers')
        .set((eb) => ({ passwordHash, mustChangePassword: false, tokenGeneration: eb('tokenGeneration', '+', 1), updatedAt: new Date() }))
        .where('id', '=', id).returning('tokenGeneration').executeTakeFirstOrThrow();
      return row.tokenGeneration;
    },
    /** 退出登录：递增令牌代次，该账号已签发的令牌全部失效 */
    revokeTokens: (id: number) =>
      db.updateTable('adminUsers').set((eb) => ({ tokenGeneration: eb('tokenGeneration', '+', 1), updatedAt: new Date() })).where('id', '=', id).execute(),
  };
}

export type AuthRepository = ReturnType<typeof createAuthRepository>;
