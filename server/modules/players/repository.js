const { getDb } = require('../../db');

function findPlayerById(id) {
  return getDb().prepare('SELECT * FROM players WHERE id = ?').get(Number(id)) || null;
}

function findAllPlayers(enabledOnly = false) {
  const sql = enabledOnly ? 'SELECT * FROM players WHERE enabled = 1 ORDER BY sort_order ASC, id ASC' : 'SELECT * FROM players ORDER BY sort_order ASC, id ASC';
  return getDb().prepare(sql).all();
}

function getNextPlayerId() {
  return getDb().prepare('SELECT COALESCE(MAX(id), 0) + 1 AS nextId FROM players').get().nextId;
}

function insertPlayer(row) {
  getDb().prepare(`
    INSERT INTO players (id, nickname, name, avatar, sex, personality, provider, model, model_id, voice_package_id, temperature, enabled, sort_order, created_at, updated_at)
    VALUES (@id, @nickname, @name, @avatar, @sex, @personality, @provider, @model, @model_id, @voice_package_id, @temperature, @enabled, @sort_order, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      nickname = excluded.nickname, name = excluded.name, avatar = excluded.avatar,
      sex = excluded.sex, personality = excluded.personality, provider = excluded.provider,
      model = excluded.model, model_id = excluded.model_id, voice_package_id = excluded.voice_package_id,
      temperature = excluded.temperature, enabled = excluded.enabled, sort_order = excluded.sort_order,
      updated_at = CURRENT_TIMESTAMP
  `).run(row);
}

function updatePlayerEnabled(id, enabled) {
  getDb().prepare('UPDATE players SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(enabled ? 1 : 0, Number(id));
}

function updatePlayerSortOrder(id, sortOrder) {
  getDb().prepare('UPDATE players SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(Number(sortOrder), Number(id));
}

function deletePlayerById(id) {
  getDb().prepare('DELETE FROM players WHERE id = ?').run(Number(id));
}

function countGamePlayersByPlayerId(id) {
  return getDb().prepare('SELECT COUNT(*) AS count FROM game_players WHERE player_id = ?').get(Number(id)).count;
}

function nullifyPlayerModelRefs(modelId) {
  getDb().prepare('UPDATE players SET model_id = NULL WHERE model_id = ?').run(Number(modelId));
}

function nullifyPlayerVoiceRefs(voiceId) {
  getDb().prepare('UPDATE players SET voice_package_id = NULL WHERE voice_package_id = ?').run(Number(voiceId));
}

module.exports = {
  findPlayerById, findAllPlayers, getNextPlayerId, insertPlayer,
  updatePlayerEnabled, updatePlayerSortOrder, deletePlayerById,
  countGamePlayersByPlayerId, nullifyPlayerModelRefs, nullifyPlayerVoiceRefs
};
