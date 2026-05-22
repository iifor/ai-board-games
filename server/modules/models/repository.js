const { getDb } = require('../../db');

function findModelById(id) {
  return getDb().prepare('SELECT * FROM models WHERE id = ?').get(Number(id)) || null;
}

function findAllModels() {
  return getDb().prepare('SELECT * FROM models ORDER BY updated_at DESC, id DESC').all();
}

function insertModel(row) {
  const result = getDb().prepare(`
    INSERT INTO models (provider, name, base_url, api_format, api_key_cipher, api_key_iv, api_key_tag, enabled, created_at, updated_at)
    VALUES (@provider, @name, @base_url, @api_format, @api_key_cipher, @api_key_iv, @api_key_tag, @enabled, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(row);
  return result.lastInsertRowid;
}

function updateModel(row) {
  getDb().prepare(`
    UPDATE models
    SET provider = @provider, name = @name, base_url = @base_url, api_format = @api_format,
        api_key_cipher = @api_key_cipher, api_key_iv = @api_key_iv, api_key_tag = @api_key_tag,
        enabled = @enabled, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run(row);
}

function deleteModelById(id) {
  getDb().prepare('DELETE FROM models WHERE id = ?').run(Number(id));
}

module.exports = { findModelById, findAllModels, insertModel, updateModel, deleteModelById };
