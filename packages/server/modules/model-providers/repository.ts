import { getDbExecutor } from '../../db';
import type { ModelProviderRow } from '../../types/database';
import type { ModelProviderRowUpdate } from './utils';

async function findAllModelProviders(): Promise<ModelProviderRow[]> {
  return getDbExecutor().queryMany<ModelProviderRow>('SELECT * FROM model_providers ORDER BY updated_at DESC, id DESC');
}

async function findModelProviderById(id: string | number): Promise<ModelProviderRow | null> {
  return getDbExecutor().queryOne<ModelProviderRow>('SELECT * FROM model_providers WHERE id = $1', [Number(id)]);
}

async function insertModelProvider(row: ModelProviderRowUpdate): Promise<number> {
  const inserted = await getDbExecutor().queryOne<{ id: number }>(`
    INSERT INTO model_providers (name, base_url, api_format, api_key_cipher, api_key_iv, api_key_tag, enabled, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id
  `, [row.name, row.base_url, row.api_format, row.api_key_cipher, row.api_key_iv, row.api_key_tag, row.enabled]);
  if (!inserted) throw new Error('Failed to create model provider');
  return inserted.id;
}

async function updateModelProvider(row: ModelProviderRowUpdate & { id: number }): Promise<void> {
  await getDbExecutor().execute(`
    UPDATE model_providers SET name = $1, base_url = $2, api_format = $3,
      api_key_cipher = $4, api_key_iv = $5, api_key_tag = $6, enabled = $7,
      updated_at = CURRENT_TIMESTAMP WHERE id = $8
  `, [row.name, row.base_url, row.api_format, row.api_key_cipher, row.api_key_iv, row.api_key_tag, row.enabled, row.id]);
}

async function countModelsByProviderId(id: string | number): Promise<number> {
  const row = await getDbExecutor().queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM models WHERE provider_id = $1', [Number(id)]);
  return row?.count || 0;
}

async function deleteModelProviderById(id: string | number): Promise<void> {
  await getDbExecutor().execute('DELETE FROM model_providers WHERE id = $1', [Number(id)]);
}

export { findAllModelProviders, findModelProviderById, insertModelProvider, updateModelProvider, countModelsByProviderId, deleteModelProviderById };
