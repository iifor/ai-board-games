import { getDbExecutor } from '../../db';
import type { DbExecutor } from '../../db/types';
import type { PlayerGameMemoryRow } from '../../types/database';

interface UpsertMemoryInput {
  gameType: string; ownerPlayerId: number; subjectPlayerId: number; gamesPlayed: number;
  familiarityScore: number; traitsJson: string; recentSummary: string;
}

async function findMemories(gameType: string, ownerPlayerId: number, subjectPlayerIds: number[]): Promise<PlayerGameMemoryRow[]> {
  if (!subjectPlayerIds.length) return [];
  return getDbExecutor().queryMany<PlayerGameMemoryRow>(`
    SELECT * FROM player_game_memories
    WHERE game_type = $1 AND owner_player_id = $2 AND subject_player_id = ANY($3::integer[])
    ORDER BY games_played DESC, updated_at DESC`, [gameType, ownerPlayerId, subjectPlayerIds]);
}
async function findMemory(gameType: string, ownerPlayerId: number, subjectPlayerId: number, db: DbExecutor = getDbExecutor()): Promise<PlayerGameMemoryRow | null> {
  return db.queryOne<PlayerGameMemoryRow>(`SELECT * FROM player_game_memories
    WHERE game_type = $1 AND owner_player_id = $2 AND subject_player_id = $3`, [gameType, ownerPlayerId, subjectPlayerId]);
}
async function upsertMemory(input: UpsertMemoryInput, db: DbExecutor = getDbExecutor()): Promise<void> {
  await db.execute(`INSERT INTO player_game_memories
    (game_type, owner_player_id, subject_player_id, games_played, familiarity_score, traits_json, recent_summary, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(game_type, owner_player_id, subject_player_id) DO UPDATE SET
      games_played = excluded.games_played, familiarity_score = excluded.familiarity_score,
      traits_json = excluded.traits_json, recent_summary = excluded.recent_summary,
      updated_at = CURRENT_TIMESTAMP`, [input.gameType, input.ownerPlayerId, input.subjectPlayerId,
    input.gamesPlayed, input.familiarityScore, input.traitsJson, input.recentSummary]);
}
async function getMemoryStats(): Promise<Array<{ gameType: string; count: number; lastUpdatedAt: string | null }>> {
  return getDbExecutor().queryMany(`SELECT game_type AS "gameType", COUNT(*) AS count,
    MAX(updated_at) AS "lastUpdatedAt" FROM player_game_memories GROUP BY game_type`);
}
async function clearMemories(gameType?: string): Promise<number> {
  const result = gameType
    ? await getDbExecutor().execute('DELETE FROM player_game_memories WHERE game_type = $1', [gameType])
    : await getDbExecutor().execute('DELETE FROM player_game_memories');
  return result.rowCount;
}

interface MemoryRecordWithPlayers extends PlayerGameMemoryRow {
  owner_nickname: string; owner_name: string; subject_nickname: string; subject_name: string;
}
async function findAllPlayerMemories(gameType: string | undefined, page: number, pageSize: number): Promise<MemoryRecordWithPlayers[]> {
  const offset = (page - 1) * pageSize;
  return getDbExecutor().queryMany<MemoryRecordWithPlayers>(`SELECT m.*,
    o.nickname AS owner_nickname, o.name AS owner_name,
    s.nickname AS subject_nickname, s.name AS subject_name
    FROM player_game_memories m
    LEFT JOIN players o ON m.owner_player_id = o.id
    LEFT JOIN players s ON m.subject_player_id = s.id
    WHERE ($1::text IS NULL OR m.game_type = $1)
    ORDER BY m.updated_at DESC LIMIT $2 OFFSET $3`, [gameType || null, pageSize, offset]);
}
async function countPlayerMemories(gameType: string | undefined): Promise<number> {
  return (await getDbExecutor().queryOne<{ count: number }>(`SELECT COUNT(*) AS count
    FROM player_game_memories WHERE ($1::text IS NULL OR game_type = $1)`, [gameType || null]))?.count || 0;
}
async function runInTransaction<T>(operation: (db: DbExecutor) => Promise<T>): Promise<T> {
  return getDbExecutor().withTransaction(operation);
}
async function loadLatestSession(matchId: string, scope: string, ownerId: string): Promise<{ snapshot_json: string; created_at: string } | null> {
  return getDbExecutor().queryOne(`SELECT snapshot_json, created_at FROM memory_snapshots
    WHERE match_id = $1 AND scope = $2 AND owner_id = $3 ORDER BY id DESC LIMIT 1`, [matchId, scope, ownerId]);
}
async function replaceSession(matchId: string, scope: string, ownerId: string, snapshotJson: string): Promise<void> {
  await getDbExecutor().withTransaction(async (transaction) => {
    await transaction.execute('DELETE FROM memory_snapshots WHERE match_id = $1 AND scope = $2 AND owner_id = $3', [matchId, scope, ownerId]);
    await transaction.execute(`INSERT INTO memory_snapshots
      (match_id, scope, owner_id, snapshot_json, source_event_seq, created_at)
      VALUES ($1, $2, $3, $4, 0, CURRENT_TIMESTAMP)`, [matchId, scope, ownerId, snapshotJson]);
  });
}

export { findMemories, findMemory, findAllPlayerMemories, countPlayerMemories, upsertMemory,
  getMemoryStats, clearMemories, runInTransaction, loadLatestSession, replaceSession };
export type { UpsertMemoryInput, MemoryRecordWithPlayers };
