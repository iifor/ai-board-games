import type { Db } from '../../db/database';

export function announcementRepository(db: Db) {
  return {
    list: (gameKey: string) => db.selectFrom('announcementTemplates').select(['key', 'customText', 'revision'])
      .where('gameKey', '=', gameKey).execute(),

    /** 恢复默认仍推进版本，避免旧编辑窗口覆盖较新的决定。 */
    async save(gameKey: string, key: string, customText: string | null, expected: number) {
      const revision = expected + 1;
      if (expected === 0) {
        return db.insertInto('announcementTemplates').values({ gameKey, key, customText, revision })
          .onConflict(c => c.columns(['gameKey', 'key']).doNothing())
          .returning(['customText', 'revision']).executeTakeFirst();
      }
      return db.updateTable('announcementTemplates').set({ customText, revision })
        .where('gameKey', '=', gameKey).where('key', '=', key).where('revision', '=', expected)
        .returning(['customText', 'revision']).executeTakeFirst();
    },
  };
}
