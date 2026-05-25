import { getDb } from '../../db';
import type { ModelProviderRow } from '../../types/database';
import type { ModelProviderRowUpdate } from './utils';

function findAllModelProviders(): ModelProviderRow[] {
  return getDb().prepare('SELECT * FROM model_providers ORDER BY updated_at DESC, id DESC').all() as ModelProviderRow[];
}

function findModelProviderById(id: string | number): ModelProviderRow | null {
  return (getDb().prepare('SELECT * FROM model_providers WHERE id = ?').get(Number(id)) as ModelProviderRow | undefined) || null;
}

function insertModelProvider(row: ModelProviderRowUpdate): number {
  const result = getDb().prepare(`
    INSERT INTO model_providers (name, base_url, api_format, api_key_cipher, api_key_iv, api_key_tag, enabled, created_at, updated_at)
    VALUES (@name, @base_url, @api_format, @api_key_cipher, @api_key_iv, @api_key_tag, @enabled, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(row);
  return Number(result.lastInsertRowid);
}

function updateModelProvider(row: ModelProviderRowUpdate & { id: number }): void {
  getDb().prepare(`
    UPDATE model_providers
    SET name = @name, base_url = @base_url, api_format = @api_format,
        api_key_cipher = @api_key_cipher, api_key_iv = @api_key_iv, api_key_tag = @api_key_tag,
        enabled = @enabled, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run(row);
}

function countModelsByProviderId(id: string | number): number {
  return Number((getDb().prepare('SELECT COUNT(*) AS count FROM models WHERE provider_id = ?').get(Number(id)) as { count: number } | undefined)?.count || 0);
}

function deleteModelProviderById(id: string | number): void {
  getDb().prepare('DELETE FROM model_providers WHERE id = ?').run(Number(id));
}

export {
  findAllModelProviders,
  findModelProviderById,
  insertModelProvider,
  updateModelProvider,
  countModelsByProviderId,
  deleteModelProviderById
};
