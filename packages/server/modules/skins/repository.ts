import { getDbExecutor } from '../../db';
import type { DbExecutor } from '../../db/types';
import type { SkinRow } from '../../types/database';

async function findSkinById(id: string): Promise<SkinRow | undefined> {
  return (await getDbExecutor().queryOne<SkinRow>('SELECT * FROM skins WHERE id = $1', [id])) || undefined;
}

async function findAllSkins(enabledOnly = false): Promise<SkinRow[]> {
  const sql = enabledOnly
    ? 'SELECT * FROM skins WHERE enabled = 1 ORDER BY updated_at DESC, name ASC'
    : 'SELECT * FROM skins ORDER BY updated_at DESC, name ASC';
  return getDbExecutor().queryMany<SkinRow>(sql);
}

async function countGamesBySkin(skinId: string): Promise<number> {
  const row = await getDbExecutor().queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM games WHERE skin_id = $1', [skinId]);
  return row?.count || 0;
}

async function insertSkin(row: SkinRow, db: DbExecutor = getDbExecutor()): Promise<void> {
  await db.execute(`
    INSERT INTO skins (id, name, version, source, terms_json, background, truth, clues_json, noises_json, memory_examples_json, enabled, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, version = excluded.version, source = excluded.source,
      terms_json = excluded.terms_json, background = excluded.background, truth = excluded.truth,
      clues_json = excluded.clues_json, noises_json = excluded.noises_json,
      memory_examples_json = excluded.memory_examples_json, enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP
  `, [row.id, row.name, row.version, row.source, row.terms_json, row.background, row.truth,
    row.clues_json, row.noises_json, row.memory_examples_json, row.enabled]);
}

async function updateSkinEnabled(id: string, enabled: boolean): Promise<void> {
  await getDbExecutor().execute('UPDATE skins SET enabled = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [enabled ? 1 : 0, id]);
}

async function deleteSkinById(id: string): Promise<void> {
  await getDbExecutor().execute('DELETE FROM skins WHERE id = $1', [id]);
}

export { findSkinById, findAllSkins, countGamesBySkin, insertSkin, updateSkinEnabled, deleteSkinById };
