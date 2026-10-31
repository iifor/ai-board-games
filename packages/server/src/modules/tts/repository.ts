import type { Db } from '../../db/database';

export function createMediaRepository(db: Db) {
  return {
    find: (id: string) => db.selectFrom('mediaAssets').selectAll().where('id', '=', id).executeTakeFirst(),
    exists: async (id: string) => Boolean(await db.selectFrom('mediaAssets').select('id').where('id', '=', id).executeTakeFirst()),
    insert: (values: { id: string; provider: string; voiceName: string; mime: string; data: Buffer }) =>
      db.insertInto('mediaAssets').values(values).onConflict((oc) => oc.column('id').doNothing()).execute(),
  };
}

export type MediaRepository = ReturnType<typeof createMediaRepository>;
