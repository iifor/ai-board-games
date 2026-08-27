import { getDbExecutor } from '../../db';
import type { DbExecutor } from '../../db/types';
import type { GameRow, GamePlayerRow } from '../../types/database';

interface GameListFilters {
  gameType?: string;
  mode?: string;
  skinId?: string;
  winner?: string;
  playerId?: number;
}

interface GameTypeCount { gameType: string; count: number }
interface PlayerSelectionRow { gameType: string; playerIdsJson: string }

async function insertOrReplaceGame(row: GameRow, db: DbExecutor = getDbExecutor()): Promise<void> {
  await db.execute(`
    INSERT INTO games (id, game_type, mode, skin_id, skin_name, winner, win_reason, topic_json,
      players_json, rounds_json, event_json, audio_resources_json, definition_version,
      snapshot_schema_version, variant_key, variant_revision, variant_snapshot_json, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    ON CONFLICT(id) DO UPDATE SET
      game_type = excluded.game_type, mode = excluded.mode, skin_id = excluded.skin_id,
      skin_name = excluded.skin_name, winner = excluded.winner, win_reason = excluded.win_reason,
      topic_json = excluded.topic_json, players_json = excluded.players_json,
      rounds_json = excluded.rounds_json, event_json = excluded.event_json,
      audio_resources_json = excluded.audio_resources_json, definition_version = excluded.definition_version,
      snapshot_schema_version = excluded.snapshot_schema_version, variant_key = excluded.variant_key,
      variant_revision = excluded.variant_revision, variant_snapshot_json = excluded.variant_snapshot_json,
      created_at = excluded.created_at
  `, [row.id, row.game_type, row.mode, row.skin_id, row.skin_name, row.winner, row.win_reason,
    row.topic_json, row.players_json, row.rounds_json, row.event_json, row.audio_resources_json,
    row.definition_version, row.snapshot_schema_version, row.variant_key, row.variant_revision,
    row.variant_snapshot_json, row.created_at]);
}

async function findAllGames(filters: GameListFilters = {}): Promise<GameRow[]> {
  return getDbExecutor().queryMany<GameRow>(`
    SELECT g.* FROM games g
    WHERE ($1::text IS NULL OR g.game_type = $1)
      AND ($2::text IS NULL OR g.mode = $2)
      AND ($3::text IS NULL OR g.skin_id = $3)
      AND ($4::text IS NULL OR g.winner = $4)
      AND ($5::integer IS NULL OR EXISTS (
        SELECT 1 FROM game_players gp WHERE gp.game_id = g.id AND gp.player_id = $5
      ))
    ORDER BY g.created_at DESC LIMIT 200
  `, [filters.gameType || null, filters.mode || null, filters.skinId || null,
    filters.winner || null, filters.playerId ? Number(filters.playerId) : null]);
}

async function findGameById(id: string, db: DbExecutor = getDbExecutor()): Promise<GameRow | null> {
  return db.queryOne<GameRow>('SELECT * FROM games WHERE id = $1', [id]);
}
async function deleteGameById(id: string, db: DbExecutor = getDbExecutor()): Promise<void> {
  await db.execute('DELETE FROM games WHERE id = $1', [id]);
}
async function insertGamePlayer(gameId: string, playerId: number, snapshotJson: string, db: DbExecutor = getDbExecutor()): Promise<void> {
  await db.execute(`INSERT INTO game_players (game_id, player_id, player_snapshot_json)
    VALUES ($1, $2, $3) ON CONFLICT(game_id, player_id) DO NOTHING`, [gameId, playerId, snapshotJson]);
}
async function deleteGamePlayers(gameId: string, db: DbExecutor = getDbExecutor()): Promise<void> {
  await db.execute('DELETE FROM game_players WHERE game_id = $1', [gameId]);
}
async function findGamePlayersByPlayerId(playerId: number): Promise<GamePlayerRow[]> {
  return getDbExecutor().queryMany<GamePlayerRow>('SELECT * FROM game_players WHERE player_id = $1', [Number(playerId)]);
}
async function findAudioResourcesExceptGame(gameId: string): Promise<string[]> {
  const rows = await getDbExecutor().queryMany<{ audio_resources_json: string }>('SELECT audio_resources_json FROM games WHERE id <> $1', [gameId]);
  return rows.map((row) => row.audio_resources_json || '[]');
}
async function countGamesByType(): Promise<GameTypeCount[]> {
  return getDbExecutor().queryMany<GameTypeCount>('SELECT game_type AS "gameType", COUNT(*) AS count FROM games GROUP BY game_type');
}
async function countAllGames(): Promise<number> {
  return (await getDbExecutor().queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM games'))?.count || 0;
}
async function countGamesBySkin(skinId: string): Promise<number> {
  return (await getDbExecutor().queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM games WHERE skin_id = $1', [skinId]))?.count || 0;
}
async function findPlayerSelections(): Promise<PlayerSelectionRow[]> {
  return getDbExecutor().queryMany<PlayerSelectionRow>('SELECT game_type AS "gameType", player_ids_json AS "playerIdsJson" FROM game_player_selections');
}
async function findPlayerSelectionByType(gameType: string): Promise<{ playerIdsJson: string } | null> {
  return getDbExecutor().queryOne<{ playerIdsJson: string }>('SELECT player_ids_json AS "playerIdsJson" FROM game_player_selections WHERE game_type = $1', [gameType]);
}
async function upsertPlayerSelection(gameType: string, playerIdsJson: string): Promise<void> {
  await getDbExecutor().execute(`INSERT INTO game_player_selections (game_type, player_ids_json, updated_at)
    VALUES ($1, $2, CURRENT_TIMESTAMP)
    ON CONFLICT(game_type) DO UPDATE SET player_ids_json = excluded.player_ids_json, updated_at = CURRENT_TIMESTAMP`, [gameType, playerIdsJson]);
}

export { insertOrReplaceGame, findAllGames, findGameById, deleteGameById,
  insertGamePlayer, deleteGamePlayers, findGamePlayersByPlayerId,
  findAudioResourcesExceptGame, countGamesByType, countAllGames, countGamesBySkin,
  findPlayerSelections, findPlayerSelectionByType, upsertPlayerSelection };
export type { GameListFilters, GameTypeCount, PlayerSelectionRow };
