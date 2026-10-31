import type { Db } from '../../db/database';

export function createAuthRepository(db: Db) {
  return {
    count: async (): Promise<number> => {
      const row = await db.selectFrom('adminUsers').select((eb) => eb.fn.countAll<string>().as('count')).executeTakeFirstOrThrow();
      return Number(row.count);
    },
    findByUsername: (username: string) =>
      db.selectFrom('adminUsers').selectAll().where('username', '=', username).executeTakeFirst(),
    findById: (id: number) => db.selectFrom('adminUsers').selectAll().where('id', '=', id).executeTakeFirst(),
    create: (username: string, passwordHash: string) =>
      db.insertInto('adminUsers').values({ username, passwordHash, mustChangePassword: true }).returning('id').executeTakeFirstOrThrow(),
    updatePassword: (id: number, passwordHash: string) =>
      db.updateTable('adminUsers').set({ passwordHash, mustChangePassword: false, updatedAt: new Date() }).where('id', '=', id).execute(),
  };
}

export type AuthRepository = ReturnType<typeof createAuthRepository>;
