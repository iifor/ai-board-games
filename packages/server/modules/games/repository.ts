import { getDb } from '../../db';
import type { GameRow, GamePlayerRow } from '../../types/database';

interface GameListFilters {
  gameType?: string;
  mode?: string;
  skinId?: string;
  winner?: string;
  playerId?: number;
}

interface GameTypeCount {
  gameType: string;
  count: number;
}

interface PlayerSelectionRow {
  gameType: string;
  playerIdsJson: string;
}

function insertOrReplaceGame(row: GameRow): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO games (id, game_type, mode, skin_id, skin_name, winner, win_reason, topic_json, players_json, rounds_json, event_json, audio_resources_json, created_at)
    VALUES (@id, @game_type, @mode, @skin_id, @skin_name, @winner, @win_reason, @topic_json, @players_json, @rounds_json, @event_json, @audio_resources_json, @created_at)
  `).run(row);
}

function findAllGames(filters: GameListFilters = {}): GameRow[] {
  const db = getDb();
  if (filters.playerId) {
    const gameIds = (db.prepare('SELECT game_id FROM game_players WHERE player_id = ?').all(Number(filters.playerId)) as { game_id: string }[]).map(r => r.game_id);
    if (gameIds.length === 0) return [];
  }
  return db.prepare('SELECT * FROM games WHERE (game_type = ? OR ? IS NULL) AND (mode = ? OR ? IS NULL) AND (skin_id = ? OR ? IS NULL) AND (winner = ? OR ? IS NULL) ORDER BY created_at DESC LIMIT 200')
    .all(filters.gameType || null, filters.gameType || null, filters.mode || null, filters.mode || null, filters.skinId || null, filters.skinId || null, filters.winner || null, filters.winner || null) as GameRow[];
}

function findGameById(id: string): GameRow | null {
  return (getDb().prepare('SELECT * FROM games WHERE id = ?').get(id) as GameRow | undefined) || null;
}

function deleteGameById(id: string): void {
  getDb().prepare('DELETE FROM games WHERE id = ?').run(id);
}

function insertGamePlayer(gameId: string, playerId: number, snapshotJson: string): void {
  getDb().prepare('INSERT OR IGNORE INTO game_players (game_id, player_id, player_snapshot_json) VALUES (?, ?, ?)').run(gameId, playerId, snapshotJson);
}

function deleteGamePlayers(gameId: string): void {
  getDb().prepare('DELETE FROM game_players WHERE game_id = ?').run(gameId);
}

function findGamePlayersByPlayerId(playerId: number): GamePlayerRow[] {
  return getDb().prepare('SELECT * FROM game_players WHERE player_id = ?').all(Number(playerId)) as GamePlayerRow[];
}

function findAudioResourcesExceptGame(gameId: string): string[] {
  return (getDb().prepare('SELECT audio_resources_json FROM games WHERE id != ?').all(gameId) as { audio_resources_json: string }[])
    .map(r => r.audio_resources_json || '[]');
}

function countGamesByType(): GameTypeCount[] {
  return getDb().prepare('SELECT game_type AS gameType, COUNT(*) AS count FROM games GROUP BY game_type').all() as GameTypeCount[];
}

function countAllGames(): number {
  return (getDb().prepare('SELECT COUNT(*) AS count FROM games').get() as { count: number }).count;
}

function countGamesBySkin(skinId: string): number {
  return (getDb().prepare('SELECT COUNT(*) AS count FROM games WHERE skin_id = ?').get(skinId) as { count: number }).count;
}

function findPlayerSelections(): PlayerSelectionRow[] {
  return getDb().prepare('SELECT game_type AS gameType, player_ids_json AS playerIdsJson FROM game_player_selections').all() as PlayerSelectionRow[];
}

function findPlayerSelectionByType(gameType: string): { playerIdsJson: string } | null {
  const row = getDb().prepare('SELECT player_ids_json AS playerIdsJson FROM game_player_selections WHERE game_type = ?').get(gameType) as { playerIdsJson: string } | undefined;
  return row || null;
}

function upsertPlayerSelection(gameType: string, playerIdsJson: string): void {
  getDb().prepare(`
    INSERT INTO game_player_selections (game_type, player_ids_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(game_type) DO UPDATE SET player_ids_json = excluded.player_ids_json, updated_at = CURRENT_TIMESTAMP
  `).run(gameType, playerIdsJson);
}

export {
  insertOrReplaceGame, findAllGames, findGameById, deleteGameById,
  insertGamePlayer, deleteGamePlayers, findGamePlayersByPlayerId,
  findAudioResourcesExceptGame, countGamesByType, countAllGames, countGamesBySkin,
  findPlayerSelections, findPlayerSelectionByType, upsertPlayerSelection
};

export type { GameListFilters, GameTypeCount, PlayerSelectionRow };
