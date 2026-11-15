import type { AiRequest } from '@battle/engine';
import type { PromptComparisonRecord } from '@battle/shared';
import { sql } from 'kysely';
import type { Db } from '../../db/database';
import { promptTemplateLock } from '../../db/locks';
import { badRequest, notFound } from '../../utils/errors';

export function comparisonRepository(db: Db) {
  return {
    async source(matchId: string, requestId: string) {
      const row = await db.selectFrom('aiTasks as t').innerJoin('matches as m', 'm.id', 't.matchId')
        .select(['t.request', 'm.gameKey', 'm.variantKey', sql<string | null>`m.snapshot -> 'seats' -> (t.seat - 1) -> 'profile' ->> 'persona'`.as('persona')])
        .where('t.matchId', '=', matchId).where('t.requestId', '=', requestId).where('m.traceDeleted', '=', false).executeTakeFirst();
      const request = row?.request as AiRequest | undefined;
      if (!row || !request?.prompt || request.id !== requestId) throw notFound('调用链请求');
      let name = request.taskTemplate?.name;
      if (!name) {
        const node = await db.selectFrom('matchTraceNodes').select(sql<string | null>`data ->> 'template'`.as('name'))
          .where('matchId', '=', matchId).where('kind', '=', 'request')
          .where(sql<boolean>`request_ids @> ${JSON.stringify([requestId])}::jsonb`).executeTakeFirst();
        name = node?.name ?? undefined;
      }
      const persona = request.taskTemplate?.applied?.persona ?? request.taskTemplate?.persona ?? row.persona?.trim() ?? '';
      return { request, persona, name, gameKey: row.gameKey, variantKey: row.variantKey };
    },
    async active(gameKey: string, variantKey: string | null, templateName: string) {
      const row = await db.selectFrom('appliedPrompts').select('comparisonId').where('gameKey', '=', gameKey)
        .where(eb => eb.not(eb.exists(eb.selectFrom('promptTemplates').select('revision')
          .where('promptTemplates.gameKey', '=', gameKey).where('promptTemplates.templateName', '=', templateName)
          .whereRef('promptTemplates.publicationOrder', '>', 'appliedPrompts.publicationOrder'))))
        .where('variantKey', '=', variantKey ?? '').where('templateName', '=', templateName).executeTakeFirst();
      return row?.comparisonId ?? null;
    },
    publish(matchId: string, requestId: string, comparisonId: number) {
      return db.transaction().execute(async tx => {
        const match = await tx.selectFrom('matches').select('traceDeleted').where('id', '=', matchId).forShare().executeTakeFirst();
        if (!match || match.traceDeleted) throw notFound('调用链');
        const record = await tx.selectFrom('promptComparisons').select('result').where('id', '=', comparisonId)
          .where('matchId', '=', matchId).where('requestId', '=', requestId).executeTakeFirst();
        if (!record) throw notFound('本请求的对比记录');
        const { publication, modified } = record.result;
        if (!publication || modified.error || modified.raw === null) throw badRequest('请选择已生成修改版回复的模板对比记录');
        const values = { ...publication, variantKey: publication.variantKey ?? '', comparisonId };
        await promptTemplateLock(tx, values.gameKey, values.templateName);
        await tx.insertInto('appliedPrompts').values(values).onConflict(c => c.columns(['gameKey','variantKey','templateName'])
          .doUpdateSet({ source: values.source, persona: values.persona, comparisonId, publicationOrder: sql`excluded.publication_order` })).execute();
        return { comparisonId };
      });
    },
    async callSettings(matchId: string, requestId: string, callId: number) {
      const call = await db.selectFrom('aiCalls').select('traceSettings')
        .where('matchId', '=', matchId).where('requestId', '=', requestId).where('id', '=', callId).executeTakeFirst();
      if (!call?.traceSettings) throw notFound('本请求的模型参数');
      return call.traceSettings;
    },
    async history(matchId: string, requestId: string): Promise<PromptComparisonRecord[]> {
      const rows = await db.selectFrom('promptComparisons').select(['id','createdAt','result'])
        .where('matchId', '=', matchId).where('requestId', '=', requestId).orderBy('id','desc').limit(10).execute();
      return rows.map(row => ({ ...row.result, id: row.id, createdAt: row.createdAt.toISOString() }));
    },
    save(matchId: string, requestId: string, result: Omit<PromptComparisonRecord,'id'|'createdAt'>): Promise<PromptComparisonRecord> {
      return db.transaction().execute(async tx => {
        const match = await tx.selectFrom('matches').select('traceDeleted').where('id', '=', matchId).forShare().executeTakeFirst();
        if (!match || match.traceDeleted) throw notFound('调用链');
        const row = await tx.insertInto('promptComparisons').values({ matchId, requestId, result: JSON.stringify(result) })
          .returning(['id','createdAt']).executeTakeFirstOrThrow();
        return { ...result, id: row.id, createdAt: row.createdAt.toISOString() };
      });
    },
  };
}
