import { sql } from 'kysely';
import type { Db } from '../../db/database';
import { comparisonRepository } from '../traces/comparisonRepository';
import { promptSettingsRepository } from './settingsRepository';

export function catalogRepository(db: Db) {
  return {
    ...promptSettingsRepository(db),
    source: comparisonRepository(db).source,
    async recent(game: string, template: string) {
      return db.selectFrom('matchTraceNodes as n').innerJoin('matches as m', 'm.id', 'n.matchId')
        .select(['n.matchId', 'n.requestIds', 'n.round', 'n.seat', 'm.scripted'])
        .where('m.gameKey', '=', game).where('m.traceDeleted', '=', false).where('n.kind', '=', 'request')
        .where(sql<string>`n.data ->> 'template'`, '=', template)
        .orderBy('n.id', 'desc').limit(12).execute();
    },
  };
}
