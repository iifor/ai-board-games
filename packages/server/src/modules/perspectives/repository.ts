import { sql } from 'kysely';
import type { Db } from '../../db/database';
import type { PerspectivePrompt, PerspectiveRequest, StageEvent } from '@battle/shared';

export function perspectiveRepository(db: Db) {
  return {
    matches: (offset: number, limit: number) => db.selectFrom('matches')
      .select(['id', 'variantKey', 'importTitle', 'createdAt']).where('gameKey', '=', 'werewolf')
      .orderBy('createdAt', 'desc').orderBy('id', 'desc').offset(offset).limit(limit).execute(),
    prompt: (id: string, request: string) => db.selectFrom('aiTasks as t').innerJoin('matches as m', 'm.id', 't.matchId')
      .select(sql<PerspectivePrompt>`t.request -> 'prompt'`.as('prompt'))
      .where('m.id', '=', id).where('m.gameKey', '=', 'werewolf').where('m.traceDeleted', '=', false)
      .where('t.requestId', '=', request).where(sql<string>`t.request #>> '{prompt,instruction}'`, 'is not', null).executeTakeFirst(),
    record: (id: string) => db.transaction().setIsolationLevel('repeatable read').execute(async tx => {
      const match = await tx.selectFrom('matches').select(['traceDeleted', 'importTitle'])
        .where('id', '=', id).where('gameKey', '=', 'werewolf').executeTakeFirst();
      if (!match) return null;
      const seats = await tx.selectFrom('matchSeats').select(['seat', 'playerName as name'])
        .where('matchId', '=', id).orderBy('seat').execute();
      const events = await tx.selectFrom('matchStageEvents').select('event').where('matchId', '=', id).orderBy('seq').execute();
      const requests = match.traceDeleted ? [] : await tx.selectFrom('matchTraceNodes as n')
        .innerJoin('aiTasks as t', join => join.onRef('t.matchId', '=', 'n.matchId')
          .on('t.requestId', '=', sql<string>`n.request_ids ->> 0`))
        .select(['t.requestId as id', 'n.round', 't.seat', sql<string>`t.request ->> 'phaseId'`.as('phase'),
          sql<string>`t.request #>> '{prompt,instruction}'`.as('instruction'),
          sql<number[] | null>`t.request -> 'legalTargets'`.as('targets')])
        .where('n.matchId', '=', id).where('n.kind', '=', 'request')
        .where(sql<string>`t.request #>> '{prompt,instruction}'`, 'is not', null).orderBy('n.id').execute() satisfies PerspectiveRequest[];
      return { seats, requests, imported: match.importTitle !== null, events: events.map(row => row.event as StageEvent),
        requestsAvailable: !match.traceDeleted && match.importTitle === null && requests.length > 0 };
    }),
  };
}
