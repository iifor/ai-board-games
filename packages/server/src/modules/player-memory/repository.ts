import type { AdvanceResult, EngineInput } from '@battle/engine';
import type { MemoryCard } from '@battle/shared';
import { sql, type Transaction } from 'kysely';
import type { Database } from '../../db/schema';
import type { LockedMatchRow } from '../matches/types';
import { acceptedDecision } from './decisions';

type Tx = Transaction<Database>;

export async function loadMemoryBank(tx: Tx, players: readonly number[], gameKey: string) {
  const owners = await lockMemoryOwners(tx, players);
  const bank: Record<string, MemoryCard[]> = Object.fromEntries(players.map(id => [id, []]));
  // 限额按主人独立计算，优先保留双方同桌的观察与适用于陌生人的经验。
  const rows = await sql<MemoryCard & { ownerId: number }>`
    select p.owner_id, m.id, m.subject_id, m.subject_name, m.content, m.phase_id, m.action
    from unnest(${players}::int[]) as p(owner_id)
    cross join lateral (
      select m.* from player_memories m where m.owner_id=p.owner_id and m.game_key=${gameKey} and not m.forgotten
      and (m.subject_id is null or m.subject_id=any(${players}::int[]))
      and not exists(select 1 from player_memories newer where newer.previous_id=m.id)
      order by m.id desc limit 24
    ) m`.execute(tx);
  for (const { ownerId, ...card } of rows.rows) bank[ownerId]?.push(card);
  return { playerMemories: bank, memoryGenerations: Object.fromEntries(owners.map(p => [p.id, p.memoryGeneration])) };
}

function lockMemoryOwners(tx: Tx, ids: readonly number[]) {
  return tx.selectFrom('players').select(['id', 'memoryGeneration']).where('id', 'in', ids).orderBy('id').forShare().execute();
}

export async function recordMemoryAdvance(tx: Tx, row: LockedMatchRow, input: EngineInput, result: AdvanceResult) {
  if (!row.snapshot.playerMemories || row.debug || row.scripted || row.importTitle) return;
  const owners = result.status === 'completed' ? await lockMemoryOwners(tx, row.snapshot.seats.map(s => Number(s.profile.playerId))) : [];
  const offers = result.aiRequests.flatMap(request => (request.memoryContext?.offered ?? []).map(m => ({
    memoryId: m.id, requestId: request.id, round: result.snapshot.round, phaseId: request.phaseId, action: request.action,
  })));
  if (offers.length) {
    // 来源局被删除后，已冻结的提示词仍可正常执行。只为仍存在的来源记忆登记索引。
    await sql`insert into player_memory_uses (match_id,request_id,memory_id,round,phase_id,action)
      select ${row.id}, x."requestId", m.id, x.round, x."phaseId", x.action
      from jsonb_to_recordset(${JSON.stringify(offers)}::jsonb) as x("memoryId" int,"requestId" text,round int,"phaseId" text,action text)
      join player_memories m on m.id=x."memoryId" on conflict do nothing`.execute(tx);
  }
  const saved = acceptedDecision(row, input, result);
  if (saved) {
    // 对局期间删除了玩家档案，也允许原座位正常完成行动。
    await tx.insertInto('playerDecisions').columns(['ownerId', 'matchId', 'requestId', 'note'])
      .expression(eb => eb.selectFrom('players').where('id', '=', saved.ownerId)
        .select(['id as ownerId', eb.val(row.id).as('matchId'), eb.val(saved.decision.requestId).as('requestId'),
          sql<string>`${JSON.stringify(saved.decision)}::jsonb`.as('note')]))
      .onConflict(c => c.doNothing()).execute();
  }
  const eligible = owners.filter(p => p.memoryGeneration === (row.snapshot.memoryGenerations?.[p.id] ?? 0)).map(p => p.id);
  if (eligible.length) {
    await tx.insertInto('playerMemoryReviews').columns(['matchId', 'ownerId', 'seat'])
      .expression(eb => eb.selectFrom('matchSeats').where('matchId', '=', row.id).where('playerId', 'in', eligible)
        .select(['matchId', 'playerId as ownerId', 'seat']).$narrowType<{ ownerId: number }>())
      .onConflict(c => c.doNothing()).execute();
  }
}
