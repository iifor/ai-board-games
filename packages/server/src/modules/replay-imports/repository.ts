import { randomUUID } from 'node:crypto';
import type { ReplayDocument } from '@battle/shared';
import type { Db } from '../../db/database';
import { conflict, notFound } from '../../utils/errors';
import type { MatchRepository } from '../matches/repository';
import { compileReplay } from './compile';

export function replayRepository(db: Db, matches: Pick<MatchRepository,'insertEvents'>) {
  const table = 'replayImports';
  const columns = ['id','title','revision','matchId'] as const;
  return {
    list: () => db.selectFrom(table).select(columns).orderBy('title').execute(),
    async get(id: string) {
      const row = await db.selectFrom(table).selectAll().where('id','=',id).executeTakeFirst();
      if (!row) throw notFound('导入草稿');
      return row;
    },
    async save(document: ReplayDocument, id?: string, revision?: number) {
      const values = { title: document.script.title, document: JSON.stringify(document) };
      if (!id) return db.insertInto(table).values({ ...values, id: randomUUID() }).returningAll().executeTakeFirstOrThrow();
      const row = await db.updateTable(table).set({ ...values, revision: (revision ?? 0)+1 }).where('id','=',id)
        .where('matchId','is',null).where('revision','=',revision ?? 0).returningAll().executeTakeFirst();
      if (!row) throw conflict('草稿已发布或已被更新，请重新打开');
      return row;
    },
    publish: (id: string, revision: number) => db.transaction().execute(async trx => {
      const draft = await trx.selectFrom(table).selectAll().where('id','=',id).forUpdate().executeTakeFirst();
      if (!draft) throw notFound('导入草稿');
      if (draft.revision !== revision) throw conflict('草稿版本已变化，请重新打开');
      if (draft.matchId) return { matchId: draft.matchId };
      const { document } = draft, { script } = document;
      const ids = script.players.flatMap(p => p.playerId === undefined ? [] : [p.playerId]);
      const profiles = ids.length ? await trx.selectFrom('players').select(['id','appearanceName','avatar','voiceId']).where('id','in',ids).forShare().execute() : [];
      const { events, result } = compileReplay(document,profiles);
      const matchId = 'm_' + randomUUID();
      await trx.insertInto('matches').values({
        id:matchId, importTitle:script.title, gameKey:script.gameKey, variantKey:null, specVersion:1, specHash:'import-v1', seed:0,
        params:'{}', status:'completed', debug:false, scripted:false, chaos:false, pacing:'free', phaseId:events.at(-1)?.phaseId ?? null,
        snapshot:JSON.stringify({log: events.map(({view:_,...entry}) => entry)}), lastSeq:events.length, error:null,
        result:result ? JSON.stringify(result) : null, completedAt:new Date(),
      }).execute();
      if (script.players.length) await trx.insertInto('matchSeats').values(script.players.map(p => ({
        matchId, seat:p.seat, playerName:p.name, playerId:p.playerId ?? null, modelId:null,
        voiceId:profiles.find(v => v.id === p.playerId)?.voiceId ?? null,
      }))).execute();
      for (let i=0;i<events.length;i+=100) await matches.insertEvents(trx,matchId,events.slice(i,i+100));
      await trx.updateTable(table).set({ matchId }).where('id','=',id).execute();
      return { matchId };
    }),
  };
}
