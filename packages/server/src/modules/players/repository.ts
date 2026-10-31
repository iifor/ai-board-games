import type { Insertable, Updateable } from 'kysely';
import type { Db } from '../../db/database';
import type { PlayersTable } from '../../db/schema';

export function createPlayerRepository(db: Db) {
  return {
    list: () => db.selectFrom('players').selectAll().orderBy('id').execute(),
    listEnabled: () => db.selectFrom('players').selectAll().where('enabled', '=', true).orderBy('id').execute(),
    findMany: (ids: readonly number[]) =>
      ids.length ? db.selectFrom('players').selectAll().where('id', 'in', [...ids]).execute() : Promise.resolve([]),
    find: (id: number) => db.selectFrom('players').selectAll().where('id', '=', id).executeTakeFirst(),
    create: (values: Insertable<PlayersTable>) => db.insertInto('players').values(values).returningAll().executeTakeFirstOrThrow(),
    update: (id: number, values: Updateable<PlayersTable>) =>
      db.updateTable('players').set({ ...values, updatedAt: new Date() }).where('id', '=', id).returningAll().executeTakeFirst(),
    remove: (id: number) => db.deleteFrom('players').where('id', '=', id).executeTakeFirst(),
  };
}

export type PlayerRepository = ReturnType<typeof createPlayerRepository>;
