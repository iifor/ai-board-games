import type { MemoryReviewCallPage, PlayerMemoryPage } from '@battle/shared';
import { sql, type NotNull } from 'kysely';
import type { Db } from '../../db/database';
import { notFound } from '../../utils/errors';

export function memoryReader(db: Db) {
  return {
    async calls(ownerId: number, offset: number, limit: number): Promise<MemoryReviewCallPage> {
      return db.transaction().setIsolationLevel('repeatable read').execute(async tx => {
        if (!await tx.selectFrom('players').select('id').where('id', '=', ownerId).executeTakeFirst()) throw notFound('玩家');
        const query = tx.selectFrom('memoryReviewCalls').where('ownerId', '=', ownerId);
        const { total } = await query.select(sql<number>`count(*)::int`.as('total')).executeTakeFirstOrThrow();
        const calls = await query.selectAll().orderBy('id', 'desc').offset(offset).limit(limit).execute();
        return { total, records: calls.map(call => ({ ...call, createdAt: call.createdAt.toISOString() })) };
      });
    },
    player(ownerId: number, offset: number, limit: number, gameKey?: string, subjectId?: number): Promise<PlayerMemoryPage> {
      return db.transaction().setIsolationLevel('repeatable read').execute(async tx => {
        if (!await tx.selectFrom('players').select('id').where('id', '=', ownerId).executeTakeFirst()) throw notFound('玩家');
        let query = tx.selectFrom('playerMemories').where('ownerId', '=', ownerId).where('forgotten', '=', false);
        if (gameKey) query = query.where('gameKey', '=', gameKey);
        if (subjectId !== undefined) query = query.where('subjectId', '=', subjectId);
        const total = await query.select(sql<number>`count(*)::int`.as('n')).executeTakeFirstOrThrow();
        const jobs = await tx.selectFrom('playerMemoryReviews').where('ownerId', '=', ownerId).select([
          sql<number>`count(*) filter(where status in ('queued','running'))::int`.as('pending'),
          sql<number>`count(*) filter(where status='failed')::int`.as('failed'),
        ]).executeTakeFirstOrThrow();
        // 只列未遗忘的记忆；约束 player_memory_source 保证它们都有来源对局（无来源的只有删除对局留下的墓碑）
        const memories = await query.selectAll().$narrowType<{ matchId: NotNull }>().orderBy('id', 'desc').limit(limit).offset(offset).execute();
        const sourceMatches = [...new Set(memories.map(m => m.matchId))];
        const notes = sourceMatches.length ? await tx.selectFrom('playerDecisions').select('note')
          .where('ownerId', '=', ownerId).where('matchId', 'in', sourceMatches).execute() : [];
        const history = memories.length ? await tx.selectFrom('playerMemoryUses as u')
          .innerJoin('aiTasks as t', j => j.onRef('t.matchId', '=', 'u.matchId').onRef('t.requestId', '=', 'u.requestId'))
          .leftJoin('playerDecisions as d', j => j.onRef('d.matchId', '=', 'u.matchId').onRef('d.requestId', '=', 'u.requestId'))
          .selectAll('u').select(['t.status', 'd.note']).where('u.memoryId', 'in', memories.map(m => m.id))
          .orderBy('t.createdAt', 'desc').orderBy('u.requestId').execute() : [];
        return { total: total.n, ...jobs, records: memories.map(m => ({ ...m, createdAt: m.createdAt.toISOString(),
          decision: notes.find(n => n.note.matchId === m.matchId && n.note.requestId === m.requestId)?.note ?? null,
          uses: history.filter(u => u.memoryId === m.id).map(u => ({ matchId: u.matchId, requestId: u.requestId, round: u.round,
            phaseId: u.phaseId, action: u.action, status: u.status, accepted: u.note !== null, choice: u.note?.choice ?? '',
            judgement: u.note?.judgement ?? '', explicitlyCited: u.note?.cited.includes(m.id) ?? false })),
        })) };
      });
    },
  };
}
