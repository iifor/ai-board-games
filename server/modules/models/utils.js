function rowToModel(row, provider) {
  if (!row) return null;
  return {
    id: row.id,
    providerId: Number(row.provider_id) || null,
    provider: provider?.name || row.provider,
    providerName: provider?.name || row.provider,
    name: row.name,
    baseUrl: provider?.baseUrl || row.base_url,
    apiFormat: provider?.apiFormat || row.api_format,
    hasApiKey: provider ? provider.hasApiKey : Boolean(row.api_key_cipher),
    providerEnabled: provider ? Boolean(provider.enabled) : Boolean(row.enabled),
    thinkingEnabled: Boolean(Number(row.thinking_enabled)),
    enabled: Boolean(row.enabled) && (provider ? Boolean(provider.enabled) : true),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rowToRuntimeModel(row, provider) {
  if (!row) return null;
  return { ...rowToModel(row, provider), apiKey: provider?.apiKey || '' };
}

function normalizeApiFormat(value) {
  const text = String(value || 'openai-compatible').trim();
  return text === 'anthropic-compatible' ? text : 'openai-compatible';
}

function modelToRow(input, provider, existing = null) {
  return {
    provider_id: Number(input.providerId || input.provider_id || existing?.provider_id || provider?.id || 0) || null,
    provider: String(provider?.name || input.provider || existing?.provider || '').trim(),
    name: String(input.name || input.modelName || existing?.name || '').trim(),
    base_url: String(provider?.baseUrl || input.baseUrl || input.base_url || existing?.base_url || '').trim(),
    api_format: normalizeApiFormat(provider?.apiFormat || input.apiFormat || input.api_format || existing?.api_format),
    api_key_cipher: existing?.api_key_cipher || '',
    api_key_iv: existing?.api_key_iv || '',
    api_key_tag: existing?.api_key_tag || '',
    thinking_enabled: input.thinkingEnabled === true ? 1 : (input.thinkingEnabled === false ? 0 : (existing?.thinking_enabled === 1 ? 1 : 0)),
    enabled: Number(input.enabled !== false && existing?.enabled !== 0)
  };
}

module.exports = { rowToModel, rowToRuntimeModel, normalizeApiFormat, modelToRow };
