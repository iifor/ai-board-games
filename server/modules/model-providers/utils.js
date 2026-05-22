const { encryptApiKey, decryptApiKey } = require('../../utils/crypto');
const { normalizeApiFormat } = require('../models/utils');

function rowToModelProvider(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    apiFormat: row.api_format,
    apiKey: decryptApiKey(row),
    hasApiKey: Boolean(row.api_key_cipher),
    enabled: Boolean(row.enabled),
    modelCount: Number(row.model_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rowToRuntimeModelProvider(row) {
  return rowToModelProvider(row);
}

function modelProviderToRow(input = {}, existing = null) {
  const hasApiKeyInput = Object.prototype.hasOwnProperty.call(input, 'apiKey');
  const apiKey = String(input.apiKey || '').trim();
  const encrypted = hasApiKeyInput && apiKey ? encryptApiKey(apiKey) : {};
  return {
    name: String(input.name || existing?.name || '').trim(),
    base_url: String(input.baseUrl ?? input.base_url ?? existing?.base_url ?? '').trim(),
    api_format: normalizeApiFormat(input.apiFormat || input.api_format || existing?.api_format),
    api_key_cipher: hasApiKeyInput ? encrypted.api_key_cipher || '' : existing?.api_key_cipher || '',
    api_key_iv: hasApiKeyInput ? encrypted.api_key_iv || '' : existing?.api_key_iv || '',
    api_key_tag: hasApiKeyInput ? encrypted.api_key_tag || '' : existing?.api_key_tag || '',
    enabled: Number(input.enabled !== undefined ? input.enabled !== false : existing?.enabled !== 0)
  };
}

module.exports = { rowToModelProvider, rowToRuntimeModelProvider, modelProviderToRow };
