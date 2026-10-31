import type { Insertable, Updateable } from 'kysely';
import type { Db } from '../../db/database';
import type { ModelProvidersTable } from '../../db/schema';

export function createProviderRepository(db: Db) {
  return {
    list: () => db.selectFrom('modelProviders').selectAll().orderBy('id').execute(),
    find: (id: number) => db.selectFrom('modelProviders').selectAll().where('id', '=', id).executeTakeFirst(),
    create: (values: Insertable<ModelProvidersTable>) =>
      db.insertInto('modelProviders').values(values).returningAll().executeTakeFirstOrThrow(),
    update: (id: number, values: Updateable<ModelProvidersTable>) =>
      db.updateTable('modelProviders').set({ ...values, updatedAt: new Date() }).where('id', '=', id).returningAll().executeTakeFirst(),
    remove: (id: number) => db.deleteFrom('modelProviders').where('id', '=', id).executeTakeFirst(),
  };
}

export type ProviderRepository = ReturnType<typeof createProviderRepository>;
