import { getDbExecutor } from '../../db';
import type { DbExecutor } from '../../db/types';
import type { PlayerRow } from '../../types/database';
import type { PlayerInsertRow } from './utils';

async function findPlayerById(id: number | string): Promise<PlayerRow | null> {
  return getDbExecutor().queryOne<PlayerRow>('SELECT * FROM players WHERE id = $1', [Number(id)]);
}
async function findAllPlayers(enabledOnly = false): Promise<PlayerRow[]> {
  return getDbExecutor().queryMany<PlayerRow>(enabledOnly
    ? 'SELECT * FROM players WHERE enabled = 1 ORDER BY sort_order ASC, id ASC'
    : 'SELECT * FROM players ORDER BY sort_order ASC, id ASC');
}
async function getNextPlayerId(): Promise<number> {
  const row = await getDbExecutor().queryOne<{ nextId: number }>('SELECT COALESCE(MAX(id), 0) + 1 AS "nextId" FROM players');
  return row?.nextId || 1;
}
async function insertPlayer(row: PlayerInsertRow, db: DbExecutor = getDbExecutor()): Promise<void> {
  await db.execute(`
    INSERT INTO players (id, nickname, name, avatar, sex, personality, provider, model, model_id, fallback_model_id, voice_package_id, temperature, enabled, sort_order, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET nickname = excluded.nickname, name = excluded.name,
      avatar = excluded.avatar, sex = excluded.sex, personality = excluded.personality,
      provider = excluded.provider, model = excluded.model, model_id = excluded.model_id,
      fallback_model_id = excluded.fallback_model_id, voice_package_id = excluded.voice_package_id,
      temperature = excluded.temperature, enabled = excluded.enabled,
      sort_order = excluded.sort_order, updated_at = CURRENT_TIMESTAMP
  `, [row.id, row.nickname, row.name, row.avatar, row.sex, row.personality, row.provider,
    row.model, row.model_id, row.fallback_model_id, row.voice_package_id, row.temperature,
    row.enabled, row.sort_order]);
}
async function updatePlayerEnabled(id: number | string, enabled: boolean): Promise<void> {
  await getDbExecutor().execute('UPDATE players SET enabled = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [enabled ? 1 : 0, Number(id)]);
}
async function updatePlayerSortOrder(id: number | string, sortOrder: number, db: DbExecutor = getDbExecutor()): Promise<void> {
  await db.execute('UPDATE players SET sort_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [Number(sortOrder), Number(id)]);
}
async function deletePlayerById(id: number | string): Promise<void> {
  await getDbExecutor().execute('DELETE FROM players WHERE id = $1', [Number(id)]);
}
async function countGamePlayersByPlayerId(id: number | string): Promise<number> {
  const row = await getDbExecutor().queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM game_players WHERE player_id = $1', [Number(id)]);
  return row?.count || 0;
}
async function nullifyPlayerModelRefs(modelId: number | string): Promise<void> {
  await getDbExecutor().withTransaction(async (transaction) => {
    await transaction.execute('UPDATE players SET model_id = NULL WHERE model_id = $1', [Number(modelId)]);
    await transaction.execute('UPDATE players SET fallback_model_id = NULL WHERE fallback_model_id = $1', [Number(modelId)]);
  });
}
async function nullifyPlayerVoiceRefs(voiceId: number | string): Promise<void> {
  await getDbExecutor().execute('UPDATE players SET voice_package_id = NULL WHERE voice_package_id = $1', [Number(voiceId)]);
}

export { findPlayerById, findAllPlayers, getNextPlayerId, insertPlayer, updatePlayerEnabled,
  updatePlayerSortOrder, deletePlayerById, countGamePlayersByPlayerId, nullifyPlayerModelRefs,
  nullifyPlayerVoiceRefs };
