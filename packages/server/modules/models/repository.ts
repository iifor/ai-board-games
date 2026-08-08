import { getDbExecutor } from '../../db';
import type { ModelRow } from '../../types/database';
import type { ModelRowInput } from './utils';

async function findModelById(id: number | string): Promise<ModelRow | null> {
  return getDbExecutor().queryOne<ModelRow>('SELECT * FROM models WHERE id = $1', [Number(id)]);
}

async function findAllModels(): Promise<ModelRow[]> {
  return getDbExecutor().queryMany<ModelRow>('SELECT * FROM models ORDER BY updated_at DESC, id DESC');
}

async function findModelsByProviderId(providerId: number | string): Promise<ModelRow[]> {
  return getDbExecutor().queryMany<ModelRow>('SELECT * FROM models WHERE provider_id = $1 ORDER BY updated_at DESC, id DESC', [Number(providerId)]);
}

async function insertModel(row: ModelRowInput): Promise<number> {
  const inserted = await getDbExecutor().queryOne<{ id: number }>(`
    INSERT INTO models (provider_id, provider, name, display_name, base_url, api_format, api_key_cipher, api_key_iv, api_key_tag, thinking_enabled, enabled, disabled_reason, disabled_at, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id
  `, [row.provider_id, row.provider, row.name, row.display_name, row.base_url, row.api_format,
    row.api_key_cipher, row.api_key_iv, row.api_key_tag, row.thinking_enabled, row.enabled,
    row.disabled_reason, row.disabled_at]);
  if (!inserted) throw new Error('Failed to create model');
  return inserted.id;
}

async function updateModel(row: ModelRowInput & { id: number }): Promise<void> {
  await getDbExecutor().execute(`
    UPDATE models SET provider_id = $1, provider = $2, name = $3, display_name = $4,
      thinking_enabled = $5, enabled = $6, disabled_reason = $7, disabled_at = $8,
      updated_at = CURRENT_TIMESTAMP WHERE id = $9
  `, [row.provider_id, row.provider, row.name, row.display_name, row.thinking_enabled,
    row.enabled, row.disabled_reason, row.disabled_at, row.id]);
}

async function updateModelAvailability(id: number | string, enabled: boolean, disabledReason: 'quota_exhausted' | null = null): Promise<void> {
  await getDbExecutor().execute(`
    UPDATE models SET enabled = $1, disabled_reason = $2, disabled_at = $3,
      updated_at = CURRENT_TIMESTAMP WHERE id = $4
  `, [enabled ? 1 : 0, disabledReason, disabledReason ? new Date().toISOString() : null, Number(id)]);
}

async function deleteModelById(id: number | string): Promise<void> {
  await getDbExecutor().execute('DELETE FROM models WHERE id = $1', [Number(id)]);
}

export { findModelById, findAllModels, findModelsByProviderId, insertModel, updateModel, updateModelAvailability, deleteModelById };
