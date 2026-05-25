import type { Model, RuntimeModel } from '../../types/api';
import type { ModelRow } from '../../types/database';
import type { ModelProvider } from '../../types/api';

interface ProviderLike {
  id?: number;
  name?: string;
  baseUrl?: string;
  apiFormat?: string;
  apiKey?: string;
  hasApiKey?: boolean;
  enabled?: boolean | number;
}

interface ModelInput {
  providerId?: number | null;
  provider_id?: number | null;
  provider?: string;
  name?: string;
  modelName?: string;
  baseUrl?: string;
  base_url?: string;
  apiFormat?: string;
  api_format?: string;
  thinkingEnabled?: boolean;
  enabled?: boolean;
}

interface ModelRowInput {
  provider_id: number | null;
  provider: string;
  name: string;
  base_url: string;
  api_format: string;
  api_key_cipher: string;
  api_key_iv: string;
  api_key_tag: string;
  thinking_enabled: number;
  enabled: number;
}

function rowToModel(row: ModelRow | null | undefined, provider?: ModelProvider | ProviderLike | null): Model | null {
  if (!row) return null;
  return {
    id: row.id,
    providerId: Number(row.provider_id) || null,
    provider: provider?.name || row.provider,
    providerName: provider?.name || row.provider,
    name: row.name,
    baseUrl: provider?.baseUrl || row.base_url,
    apiFormat: provider?.apiFormat || row.api_format,
    hasApiKey: provider ? Boolean(provider.hasApiKey) : Boolean(row.api_key_cipher),
    providerEnabled: provider ? Boolean(provider.enabled) : Boolean(row.enabled),
    thinkingEnabled: Boolean(Number(row.thinking_enabled)),
    enabled: Boolean(row.enabled) && (provider ? Boolean(provider.enabled) : true),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rowToRuntimeModel(row: ModelRow | null | undefined, provider?: ModelProvider | ProviderLike | null): RuntimeModel | null {
  if (!row) return null;
  const model = rowToModel(row, provider);
  if (!model) return null;
  return { ...model, apiKey: provider?.apiKey || '' };
}

function normalizeApiFormat(value: unknown): string {
  const text = String(value || 'openai-compatible').trim();
  return text === 'anthropic-compatible' ? text : 'openai-compatible';
}

function modelToRow(input: ModelInput, provider?: ModelProvider | ProviderLike | null, existing?: ModelRow | null): ModelRowInput {
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

export { rowToModel, rowToRuntimeModel, normalizeApiFormat, modelToRow };
export type { ProviderLike, ModelInput, ModelRowInput };
