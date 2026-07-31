import { getDb } from '../../db';
import type { ModelRow } from '../../types/database';
import type { ModelRowInput } from './utils';

function findModelById(id: number | string): ModelRow | null {
  return (getDb().prepare('SELECT * FROM models WHERE id = ?').get(Number(id)) as ModelRow | undefined) || null;
}

function findAllModels(): ModelRow[] {
  return getDb().prepare('SELECT * FROM models ORDER BY updated_at DESC, id DESC').all() as ModelRow[];
}

function findModelsByProviderId(providerId: number | string): ModelRow[] {
  return getDb().prepare('SELECT * FROM models WHERE provider_id = ? ORDER BY updated_at DESC, id DESC').all(Number(providerId)) as ModelRow[];
}

function insertModel(row: ModelRowInput): number {
  const result = getDb().prepare(`
    INSERT INTO models (provider_id, provider, name, base_url, api_format, api_key_cipher, api_key_iv, api_key_tag, enabled, created_at, updated_at)
    VALUES (@provider_id, @provider, @name, @base_url, @api_format, @api_key_cipher, @api_key_iv, @api_key_tag, @enabled, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(row);
  return result.lastInsertRowid as number;
}

function updateModel(row: ModelRowInput & { id: number }): void {
  getDb().prepare(`
    UPDATE models
    SET provider_id = @provider_id,
        provider = @provider,
        name = @name,
        thinking_enabled = @thinking_enabled,
        enabled = @enabled,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run(row);
}

function updateModelEnabled(id: number | string, enabled: boolean): void {
  getDb().prepare('UPDATE models SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(enabled ? 1 : 0, Number(id));
}

function deleteModelById(id: number | string): void {
  getDb().prepare('DELETE FROM models WHERE id = ?').run(Number(id));
}

export { findModelById, findAllModels, findModelsByProviderId, insertModel, updateModel, updateModelEnabled, deleteModelById };
