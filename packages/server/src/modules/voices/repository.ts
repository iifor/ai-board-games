import type { Insertable, Updateable } from 'kysely';
import type { Db } from '../../db/database';
import type { VoicesTable } from '../../db/schema';

/** 合成语音需要的音色参数列 */
export const VOICE_CHOICE_COLUMNS = ['provider', 'voiceName', 'language', 'style', 'rate', 'pitch'] as const;

export function createVoiceRepository(db: Db) {
  return {
    list: () => db.selectFrom('voices').selectAll().orderBy('id').execute(),
    find: (id: number) => db.selectFrom('voices').selectAll().where('id', '=', id).executeTakeFirst(),
    /** 按名称查找启用的音色，只取合成需要的参数（主持播报用） */
    findEnabledByName: (name: string) =>
      db.selectFrom('voices').select(VOICE_CHOICE_COLUMNS).where('name', '=', name).where('enabled', '=', true).executeTakeFirst(),
    create: (values: Insertable<VoicesTable>) => db.insertInto('voices').values(values).returningAll().executeTakeFirstOrThrow(),
    update: (id: number, values: Updateable<VoicesTable>) =>
      db.updateTable('voices').set({ ...values, updatedAt: new Date() }).where('id', '=', id).returningAll().executeTakeFirst(),
    remove: (id: number) => db.deleteFrom('voices').where('id', '=', id).executeTakeFirst(),
  };
}

export type VoiceRepository = ReturnType<typeof createVoiceRepository>;
