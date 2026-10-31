import type { Insertable, Updateable } from 'kysely';
import type { Db } from '../../db/database';
import type { VoicesTable } from '../../db/schema';

export function createVoiceRepository(db: Db) {
  return {
    list: () => db.selectFrom('voices').selectAll().orderBy('id').execute(),
    find: (id: number) => db.selectFrom('voices').selectAll().where('id', '=', id).executeTakeFirst(),
    create: (values: Insertable<VoicesTable>) => db.insertInto('voices').values(values).returningAll().executeTakeFirstOrThrow(),
    update: (id: number, values: Updateable<VoicesTable>) =>
      db.updateTable('voices').set({ ...values, updatedAt: new Date() }).where('id', '=', id).returningAll().executeTakeFirst(),
    remove: (id: number) => db.deleteFrom('voices').where('id', '=', id).executeTakeFirst(),
  };
}

export type VoiceRepository = ReturnType<typeof createVoiceRepository>;
