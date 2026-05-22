const { getDb } = require('../../db');

function insertOrReplaceGame(row) {
  getDb().prepare(`
    INSERT OR REPLACE INTO games (id, game_type, mode, skin_id, skin_name, winner, win_reason, topic_json, players_json, rounds_json, event_json, audio_resources_json, created_at)
    VALUES (@id, @game_type, @mode, @skin_id, @skin_name, @winner, @win_reason, @topic_json, @players_json, @rounds_json, @event_json, @audio_resources_json, @created_at)
  `).run(row);
}

function findAllGames(filters = {}) {
  const db = getDb();
  if (filters.playerId) {
    const gameIds = db.prepare('SELECT game_id FROM game_players WHERE player_id = ?').all(Number(filters.playerId)).map(r => r.game_id);
    if (gameIds.length === 0) return [];
  }
  return db.prepare('SELECT * FROM games WHERE (game_type = ? OR ? IS NULL) AND (mode = ? OR ? IS NULL) AND (skin_id = ? OR ? IS NULL) AND (winner = ? OR ? IS NULL) ORDER BY created_at DESC LIMIT 200')
    .all(filters.gameType || null, filters.gameType || null, filters.mode || null, filters.mode || null, filters.skinId || null, filters.skinId || null, filters.winner || null, filters.winner || null);
}

function findGameById(id) {
  return getDb().prepare('SELECT * FROM games WHERE id = ?').get(id) || null;
}

function deleteGameById(id) {
  getDb().prepare('DELETE FROM games WHERE id = ?').run(id);
}

function insertGamePlayer(gameId, playerId, snapshotJson) {
  getDb().prepare('INSERT INTO game_players (game_id, player_id, player_snapshot_json) VALUES (?, ?, ?)').run(gameId, playerId, snapshotJson);
}

function deleteGamePlayers(gameId) {
  getDb().prepare('DELETE FROM game_players WHERE game_id = ?').run(gameId);
}

function findGamePlayersByPlayerId(playerId) {
  return getDb().prepare('SELECT * FROM game_players WHERE player_id = ?').all(Number(playerId));
}

function findAudioResourcesExceptGame(gameId) {
  return getDb().prepare("SELECT audio_resources_json FROM games WHERE id != ?").all(gameId)
    .map(r => r.audio_resources_json || '[]');
}

function countGamesByType() {
  return getDb().prepare('SELECT game_type AS gameType, COUNT(*) AS count FROM games GROUP BY game_type').all();
}

function countAllGames() {
  return getDb().prepare('SELECT COUNT(*) AS count FROM games').get().count;
}

function countGamesBySkin(skinId) {
  return getDb().prepare('SELECT COUNT(*) AS count FROM games WHERE skin_id = ?').get(skinId).count;
}

function findPlayerSelections() {
  return getDb().prepare('SELECT game_type AS gameType, player_ids_json AS playerIdsJson FROM game_player_selections').all();
}

function findPlayerSelectionByType(gameType) {
  const row = getDb().prepare('SELECT player_ids_json AS playerIdsJson FROM game_player_selections WHERE game_type = ?').get(gameType);
  return row || null;
}

function upsertPlayerSelection(gameType, playerIdsJson) {
  getDb().prepare(`
    INSERT INTO game_player_selections (game_type, player_ids_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(game_type) DO UPDATE SET player_ids_json = excluded.player_ids_json, updated_at = CURRENT_TIMESTAMP
  `).run(gameType, playerIdsJson);
}

module.exports = {
  insertOrReplaceGame, findAllGames, findGameById, deleteGameById,
  insertGamePlayer, deleteGamePlayers, findGamePlayersByPlayerId,
  findAudioResourcesExceptGame, countGamesByType, countAllGames, countGamesBySkin,
  findPlayerSelections, findPlayerSelectionByType, upsertPlayerSelection
};
