import type { Insertable, Updateable } from 'kysely';
import type { Db } from '../../db/database';
import type { ModelsTable } from '../../db/schema';
import { importProviderModels } from './importModels';

export function createModelRepository(db: Db) {
  return {
    importedIds: (providerId: number) => db.selectFrom('models').select('model').where('providerId', '=', providerId).execute(),
    importSelected: (providerId: number, ids: readonly string[]) => importProviderModels(db, providerId, ids),
    list: () => db.selectFrom('models').selectAll().orderBy('id').execute(),
    find: (id: number) => db.selectFrom('models').selectAll().where('id', '=', id).executeTakeFirst(),
    /** 各供应商下的模型数（count 由 pg 以字符串返回） */
    countByProvider: () =>
      db.selectFrom('models').select((eb) => ['providerId', eb.fn.countAll<string>().as('count')]).groupBy('providerId').execute(),
    create: (values: Insertable<ModelsTable>) => db.insertInto('models').values(values).returningAll().executeTakeFirstOrThrow(),
    update: (id: number, values: Updateable<ModelsTable>) =>
      db.updateTable('models').set({ ...values, updatedAt: new Date() }).where('id', '=', id).returningAll().executeTakeFirst(),
    remove: (id: number) => db.deleteFrom('models').where('id', '=', id).executeTakeFirst(),
  };
}

export type ModelRepository = ReturnType<typeof createModelRepository>;
