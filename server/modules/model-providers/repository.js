const { getDb } = require('../../db');

function findAllModelProviders() {
  return getDb().prepare('SELECT * FROM model_providers ORDER BY updated_at DESC, id DESC').all();
}

function findModelProviderById(id) {
  return getDb().prepare('SELECT * FROM model_providers WHERE id = ?').get(Number(id)) || null;
}

function insertModelProvider(row) {
  const result = getDb().prepare(`
    INSERT INTO model_providers (name, base_url, api_format, api_key_cipher, api_key_iv, api_key_tag, enabled, created_at, updated_at)
    VALUES (@name, @base_url, @api_format, @api_key_cipher, @api_key_iv, @api_key_tag, @enabled, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(row);
  return result.lastInsertRowid;
}

function updateModelProvider(row) {
  getDb().prepare(`
    UPDATE model_providers
    SET name = @name, base_url = @base_url, api_format = @api_format,
        api_key_cipher = @api_key_cipher, api_key_iv = @api_key_iv, api_key_tag = @api_key_tag,
        enabled = @enabled, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run(row);
}

function countModelsByProviderId(id) {
  return Number(getDb().prepare('SELECT COUNT(*) AS count FROM models WHERE provider_id = ?').get(Number(id))?.count || 0);
}

function deleteModelProviderById(id) {
  getDb().prepare('DELETE FROM model_providers WHERE id = ?').run(Number(id));
}

module.exports = {
  findAllModelProviders,
  findModelProviderById,
  insertModelProvider,
  updateModelProvider,
  countModelsByProviderId,
  deleteModelProviderById
};
