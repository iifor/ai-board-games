import { encryptApiKey, decryptApiKey } from '../../utils/crypto';
import { normalizeApiFormat } from '../models/utils';
import type { ModelProvider } from '../../types/api';
import type { ModelProviderRow } from '../../types/database';

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function rowToModelProvider(row: ModelProviderRow & { model_count?: number }): ModelProvider {
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

function rowToRuntimeModelProvider(row: ModelProviderRow & { model_count?: number }): ModelProvider {
  return rowToModelProvider(row);
}

interface ModelProviderInput {
  name?: string;
  baseUrl?: string;
  base_url?: string;
  apiFormat?: string;
  api_format?: string;
  apiKey?: string;
  enabled?: boolean;
}

interface ModelProviderRowUpdate {
  name: string;
  base_url: string;
  api_format: string;
  api_key_cipher: string;
  api_key_iv: string;
  api_key_tag: string;
  enabled: number;
}

function modelProviderToRow(input: ModelProviderInput = {}, existing: ModelProviderRow | null = null): ModelProviderRowUpdate {
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

export { parseJson, toJson, rowToModelProvider, rowToRuntimeModelProvider, modelProviderToRow };
export type { ModelProviderInput, ModelProviderRowUpdate };
