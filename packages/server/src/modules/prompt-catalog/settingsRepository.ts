import { platformContract, playerExpression, type CompiledGame, type MatchPromptSet } from '@battle/engine';
import { sql } from 'kysely';
import type { Db } from '../../db/database';
import { promptTemplateLock } from '../../db/locks';

export function promptSettingsRepository(db: Db) {
  return {
    get: (group: string, key: string) => db.selectFrom('promptTemplates').select(['source', 'revision'])
      .where('gameKey', '=', group).where('templateName', '=', key).executeTakeFirst(),
    async save(group: string, key: string, source: string, expected: number) {
      const values = { gameKey: group, templateName: key, source, revision: expected + 1 };
      return db.transaction().execute(async tx => {
        await promptTemplateLock(tx, group, key);
        if (expected === 0) return tx.insertInto('promptTemplates').values(values)
          .onConflict(c => c.columns(['gameKey', 'templateName']).doNothing()).returning('revision').executeTakeFirst();
        return tx.updateTable('promptTemplates').set({ source, revision: expected + 1, publicationOrder: sql`nextval('prompt_publication_order')` })
          .where('gameKey', '=', group).where('templateName', '=', key).where('revision', '=', expected)
          .returning('revision').executeTakeFirst();
      });
    },
  };
}

/** 一条查询同时读取目录和调试台配置，避免两次读取之间发生发布。 */
export async function readMatchPrompts(db: Db, game: CompiledGame, variant: string | null) {
  const rows = await db.selectFrom('promptTemplates').select(['gameKey', 'templateName', 'source', 'publicationOrder',
    sql<string | null>`null::text`.as('persona'), sql<boolean>`false`.as('trial')])
    .where(eb => eb.or([eb('gameKey', '=', game.spec.key), eb.and([eb('gameKey', '=', 'system'), eb('templateName', 'in', ['platform', 'playerExpression'])])]))
    .unionAll(db.selectFrom('appliedPrompts').select(['gameKey', 'templateName', 'source', 'publicationOrder', 'persona', sql<boolean>`true`.as('trial')])
      .where('gameKey', '=', game.spec.key).where('variantKey', '=', variant ?? ''))
    .unionAll(db.selectFrom('announcementTemplates').select([sql<string>`'announcement'`.as('gameKey'), 'key as templateName',
      sql<string>`custom_text`.as('source'), sql<string>`0::bigint`.as('publicationOrder'), sql<string | null>`null::text`.as('persona'),
      sql<boolean>`false`.as('trial')]).where('gameKey', '=', game.spec.key).where('customText', 'is not', null))
    .orderBy('publicationOrder').execute();
  const sources = Object.fromEntries([...game.prompts].map(([key, template]) => [key, template.source]));
  const trials: Record<string, { source: string; persona: string | null }> = {};
  const announcementOverrides: Record<string, string> = {};
  let platform = platformContract('{{title}}');
  let expression = playerExpression;
  for (const row of rows) {
    if (row.gameKey === 'announcement') announcementOverrides[row.templateName] = row.source;
    else if (row.gameKey === 'system') {
      if (row.templateName === 'platform') platform = row.source;
      if (row.templateName === 'playerExpression') expression = row.source;
    }
    else if (row.trial) trials[row.templateName] = { source: row.source, persona: row.persona };
    else {
      sources[row.templateName] = row.source;
      delete trials[row.templateName];
    }
  }
  const promptSet: MatchPromptSet = { sources, trials, platform, playerExpression: expression };
  return { promptSet, ...(Object.keys(announcementOverrides).length > 0 && { announcementOverrides }) };
}
