import { getDb } from '../../db';
import type { PlayerGameMemoryRow } from '../../types/database';

interface UpsertMemoryInput {
  gameType: string;
  ownerPlayerId: number;
  subjectPlayerId: number;
  gamesPlayed: number;
  familiarityScore: number;
  traitsJson: string;
  recentSummary: string;
}

function findMemories(gameType: string, ownerPlayerId: number, subjectPlayerIds: number[]): PlayerGameMemoryRow[] {
  if (!subjectPlayerIds.length) return [];
  const placeholders = subjectPlayerIds.map(() => '?').join(',');
  return getDb().prepare(`
    SELECT * FROM player_game_memories
    WHERE game_type = ? AND owner_player_id = ? AND subject_player_id IN (${placeholders})
    ORDER BY games_played DESC, familiarity_score DESC, updated_at DESC
  `).all(gameType, ownerPlayerId, ...subjectPlayerIds) as PlayerGameMemoryRow[];
}

function findMemory(gameType: string, ownerPlayerId: number, subjectPlayerId: number): PlayerGameMemoryRow | null {
  return (getDb().prepare(`
    SELECT * FROM player_game_memories
    WHERE game_type = ? AND owner_player_id = ? AND subject_player_id = ?
  `).get(gameType, ownerPlayerId, subjectPlayerId) as PlayerGameMemoryRow | undefined) || null;
}

function upsertMemory(input: UpsertMemoryInput): void {
  getDb().prepare(`
    INSERT INTO player_game_memories (
      game_type, owner_player_id, subject_player_id, games_played,
      familiarity_score, traits_json, recent_summary, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(game_type, owner_player_id, subject_player_id) DO UPDATE SET
      games_played = excluded.games_played,
      familiarity_score = excluded.familiarity_score,
      traits_json = excluded.traits_json,
      recent_summary = excluded.recent_summary,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    input.gameType,
    input.ownerPlayerId,
    input.subjectPlayerId,
    input.gamesPlayed,
    input.familiarityScore,
    input.traitsJson,
    input.recentSummary,
  );
}

function getMemoryStats(): Array<{ gameType: string; count: number; lastUpdatedAt: string | null }> {
  return getDb().prepare(`
    SELECT game_type AS gameType, COUNT(*) AS count, MAX(updated_at) AS lastUpdatedAt
    FROM player_game_memories
    GROUP BY game_type
  `).all() as Array<{ gameType: string; count: number; lastUpdatedAt: string | null }>;
}

function clearMemories(gameType?: string): number {
  const result = gameType
    ? getDb().prepare('DELETE FROM player_game_memories WHERE game_type = ?').run(gameType)
    : getDb().prepare('DELETE FROM player_game_memories').run();
  return Number(result.changes || 0);
}

function runInTransaction<T>(operation: () => T): T {
  return getDb().transaction(operation)() as T;
}

function loadLatestSession(matchId: string, scope: string, ownerId: string): { snapshot_json: string; created_at: string } | null {
  return (getDb().prepare(`
    SELECT snapshot_json, created_at FROM memory_snapshots
    WHERE match_id = ? AND scope = ? AND owner_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(matchId, scope, ownerId) as { snapshot_json: string; created_at: string } | undefined) || null;
}

function replaceSession(matchId: string, scope: string, ownerId: string, snapshotJson: string): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM memory_snapshots WHERE match_id = ? AND scope = ? AND owner_id = ?')
      .run(matchId, scope, ownerId);
    db.prepare(`
      INSERT INTO memory_snapshots (match_id, scope, owner_id, snapshot_json, source_event_seq, created_at)
      VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
    `).run(matchId, scope, ownerId, snapshotJson);
  })();
}

export {
  findMemories,
  findMemory,
  upsertMemory,
  getMemoryStats,
  clearMemories,
  runInTransaction,
  loadLatestSession,
  replaceSession,
};
