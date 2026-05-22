const { getDb } = require('../../db');
const { encryptApiKey, decryptApiKey } = require('../../utils/crypto');

function findSkinById(id) {
  const row = getDb().prepare('SELECT * FROM skins WHERE id = ?').get(id);
  return row || null;
}

function findAllSkins(enabledOnly = false) {
  const sql = enabledOnly ? 'SELECT * FROM skins WHERE enabled = 1 ORDER BY updated_at DESC, name ASC' : 'SELECT * FROM skins ORDER BY updated_at DESC, name ASC';
  return getDb().prepare(sql).all();
}

function countGamesBySkin(skinId) {
  return getDb().prepare('SELECT COUNT(*) AS count FROM games WHERE skin_id = ?').get(skinId).count;
}

function insertSkin(row) {
  getDb().prepare(`
    INSERT INTO skins (id, name, version, source, terms_json, background, truth, clues_json, noises_json, memory_examples_json, enabled, created_at, updated_at)
    VALUES (@id, @name, @version, @source, @terms_json, @background, @truth, @clues_json, @noises_json, @memory_examples_json, @enabled, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, version = excluded.version, source = excluded.source,
      terms_json = excluded.terms_json, background = excluded.background, truth = excluded.truth,
      clues_json = excluded.clues_json, noises_json = excluded.noises_json,
      memory_examples_json = excluded.memory_examples_json, enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP
  `).run(row);
}

function updateSkinEnabled(id, enabled) {
  getDb().prepare('UPDATE skins SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(enabled ? 1 : 0, id);
}

function deleteSkinById(id) {
  getDb().prepare('DELETE FROM skins WHERE id = ?').run(id);
}

module.exports = { findSkinById, findAllSkins, countGamesBySkin, insertSkin, updateSkinEnabled, deleteSkinById };
