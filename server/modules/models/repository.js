const { getDb } = require('../../db');

function findModelById(id) {
  return getDb().prepare('SELECT * FROM models WHERE id = ?').get(Number(id)) || null;
}

function findAllModels() {
  return getDb().prepare('SELECT * FROM models ORDER BY updated_at DESC, id DESC').all();
}

function findModelsByProviderId(providerId) {
  return getDb().prepare('SELECT * FROM models WHERE provider_id = ? ORDER BY updated_at DESC, id DESC').all(Number(providerId));
}

function insertModel(row) {
  const result = getDb().prepare(`
    INSERT INTO models (provider_id, provider, name, base_url, api_format, api_key_cipher, api_key_iv, api_key_tag, enabled, created_at, updated_at)
    VALUES (@provider_id, @provider, @name, @base_url, @api_format, @api_key_cipher, @api_key_iv, @api_key_tag, @enabled, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(row);
  return result.lastInsertRowid;
}

function updateModel(row) {
  getDb().prepare(`
    UPDATE models
    SET provider_id = @provider_id, provider = @provider, name = @name, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run(row);
}

function deleteModelById(id) {
  getDb().prepare('DELETE FROM models WHERE id = ?').run(Number(id));
}

module.exports = { findModelById, findAllModels, findModelsByProviderId, insertModel, updateModel, deleteModelById };
