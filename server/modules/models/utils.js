const { encryptApiKey, decryptApiKey } = require('../../utils/crypto');

function rowToModel(row) {
  if (!row) return null;
  const hasApiKey = Boolean(row.api_key_cipher);
  return {
    id: row.id, provider: row.provider, name: row.name, baseUrl: row.base_url,
    apiFormat: row.api_format, hasApiKey,
    apiKey: hasApiKey ? decryptApiKey(row) : '',
    enabled: Boolean(row.enabled), createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function rowToRuntimeModel(row) {
  if (!row) return null;
  return { ...rowToModel(row), apiKey: decryptApiKey(row) };
}

function normalizeApiFormat(value) {
  const text = String(value || 'openai-compatible').trim();
  return text === 'anthropic-compatible' ? text : 'openai-compatible';
}

function modelToRow(input, existing = null) {
  const encrypted = Object.prototype.hasOwnProperty.call(input, 'apiKey') && String(input.apiKey || '').trim()
    ? encryptApiKey(input.apiKey) : {};
  return {
    provider: String(input.provider || existing?.provider || '').trim(),
    name: String(input.name || input.modelName || existing?.name || '').trim(),
    base_url: String(input.baseUrl || input.base_url || existing?.base_url || '').trim(),
    api_format: normalizeApiFormat(input.apiFormat || input.api_format || existing?.api_format || 'openai-compatible'),
    api_key_cipher: encrypted.api_key_cipher ?? existing?.api_key_cipher ?? '',
    api_key_iv: encrypted.api_key_iv ?? existing?.api_key_iv ?? '',
    api_key_tag: encrypted.api_key_tag ?? existing?.api_key_tag ?? '',
    enabled: Number(input.enabled !== false)
  };
}

module.exports = { rowToModel, rowToRuntimeModel, normalizeApiFormat, modelToRow };
