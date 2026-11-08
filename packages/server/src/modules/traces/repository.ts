import { sql } from 'kysely';
import type { Db } from '../../db/database';
import type { MatchStatus, ModelUsageDto } from '@battle/shared';

const MATCH = ['id', 'gameKey', 'variantKey', 'scripted', 'status', 'createdAt'] as const;
const NODE = ['id', 'round', 'phaseId', 'visit', 'kind', 'label', 'seat', 'seq', 'requestIds', 'inputRequestId', 'createdAt'] as const;

export function createTraceRepository(db: Db) {
  return {
    list(filter: { limit: number; offset: number; status?: MatchStatus | undefined; gameKey?: string | undefined }) {
      let query = db.selectFrom('matches').select(MATCH).where('traceDeleted', '=', false)
        .where((eb) => eb.exists(eb.selectFrom('matchTraceNodes').select('id').whereRef('matchTraceNodes.matchId', '=', 'matches.id')));
      if (filter.status) query = query.where('status', '=', filter.status);
      if (filter.gameKey) query = query.where('gameKey', '=', filter.gameKey);
      return query.orderBy('createdAt', 'desc').orderBy('id', 'desc').limit(filter.limit).offset(filter.offset).execute();
    },

    overview(matchId: string) {
      return db.transaction().setIsolationLevel('repeatable read').execute(async (tx) => {
        const match = await tx.selectFrom('matches').select([...MATCH, 'error']).where('id', '=', matchId).where('traceDeleted', '=', false).executeTakeFirst();
        if (!match) return null;
        const seats = await tx.selectFrom('matchSeats').select(['seat', 'playerId', 'playerName as name'])
          .where('matchId', '=', matchId).orderBy('seat').execute();
        const nodes = await tx.selectFrom('matchTraceNodes').select(NODE)
          .where('matchId', '=', matchId).orderBy('id').execute();
        const calls = await tx.selectFrom('aiCalls').select(['id', 'requestId', 'modelName', 'seat', 'latencyMs', 'createdAt', 'error'])
          .where('matchId', '=', matchId).orderBy('id').execute();
        const models = await tx.selectFrom('aiCalls').select(['modelName',
          sql<number>`count(*)::int`.as('calls'), sql<number>`count(error)::int`.as('failures'),
          sql<number>`count(*) filter (where usage->>'promptTokens' is not null)::int`.as('measured'),
          sql<number>`coalesce(sum((usage->>'promptTokens')::bigint), 0)::float8`.as('promptTokens'),
          sql<number>`coalesce(sum((usage->>'completionTokens')::bigint), 0)::float8`.as('completionTokens'),
        ]).where('matchId', '=', matchId).groupBy('modelName').orderBy('modelName').execute() satisfies ModelUsageDto[];
        return { match, seats, nodes, models, calls };
      });
    },

    remove(matchId: string) {
      return db.transaction().execute(async (tx) => {
        const match = await tx.selectFrom('matches').select('traceDeleted').where('id', '=', matchId).forUpdate().executeTakeFirst();
        if (!match) return false;
        if (match.traceDeleted) return true;
        await tx.updateTable('matches').set({ traceDeleted: true }).where('id', '=', matchId).execute();
        await tx.deleteFrom('matchTraceNodes').where('matchId', '=', matchId).execute();
        await tx.deleteFrom('aiCalls').where('matchId', '=', matchId).execute();
        await tx.updateTable('aiTasks').set({ request: '{}', output: null, error: null }).where('matchId', '=', matchId)
          .where('status', 'in', ['succeeded', 'failed', 'cancelled']).execute();
        return true;
      });
    },

    node(matchId: string, id: number) {
      return db.transaction().setIsolationLevel('repeatable read').execute(async (tx) => {
        const node = await tx.selectFrom('matchTraceNodes').select(['kind', 'seq', 'requestIds', 'inputRequestId', 'data'])
          .where('matchId', '=', matchId).where('id', '=', id).executeTakeFirst();
        if (!node) return null;
        const stage = node.kind === 'stage' && node.seq !== null
          ? await tx.selectFrom('matchStageEvents').select('event').where('matchId', '=', matchId).where('seq', '=', node.seq).executeTakeFirst()
          : null;
        const ids = [...new Set([...node.requestIds, ...(node.inputRequestId ? [node.inputRequestId] : [])])];
        const tasks = ids.length ? await tx.selectFrom('aiTasks').select(['requestId', 'request', 'status', 'output', 'error'])
          .where('matchId', '=', matchId).where('requestId', 'in', ids).orderBy('seat').execute() : [];
        const calls = ids.length ? await tx.selectFrom('aiCalls').selectAll()
          .where('matchId', '=', matchId).where('requestId', 'in', ids).orderBy('id').execute() : [];
        return { data: node.data, event: stage?.event ?? null, tasks, calls };
      });
    },
  };
}

export type TraceRepository = ReturnType<typeof createTraceRepository>;
