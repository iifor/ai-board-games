import { getDb } from '../../db';
import type { PlayerRow } from '../../types/database';
import type { PlayerInsertRow } from './utils';

function findPlayerById(id: number | string): PlayerRow | null {
  return (getDb().prepare('SELECT * FROM players WHERE id = ?').get(Number(id)) as PlayerRow | undefined) || null;
}

function findAllPlayers(enabledOnly = false): PlayerRow[] {
  const sql = enabledOnly
    ? 'SELECT * FROM players WHERE enabled = 1 ORDER BY sort_order ASC, id ASC'
    : 'SELECT * FROM players ORDER BY sort_order ASC, id ASC';
  return getDb().prepare(sql).all() as PlayerRow[];
}

function getNextPlayerId(): number {
  return (getDb().prepare('SELECT COALESCE(MAX(id), 0) + 1 AS nextId FROM players').get() as { nextId: number }).nextId;
}

function insertPlayer(row: PlayerInsertRow): void {
  getDb().prepare(`
    INSERT INTO players (id, nickname, name, avatar, sex, personality, provider, model, model_id, voice_package_id, temperature, enabled, sort_order, created_at, updated_at)
    VALUES (@id, @nickname, @name, @avatar, @sex, @personality, @provider, @model, @model_id, @voice_package_id, @temperature, @enabled, @sort_order, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      nickname = excluded.nickname, name = excluded.name, avatar = excluded.avatar,
      sex = excluded.sex, personality = excluded.personality, provider = excluded.provider,
      model = excluded.model, model_id = excluded.model_id, voice_package_id = excluded.voice_package_id,
      temperature = excluded.temperature, enabled = excluded.enabled, sort_order = excluded.sort_order,
      updated_at = CURRENT_TIMESTAMP
  `).run(row);
}

function updatePlayerEnabled(id: number | string, enabled: boolean): void {
  getDb().prepare('UPDATE players SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(enabled ? 1 : 0, Number(id));
}

function updatePlayerSortOrder(id: number | string, sortOrder: number): void {
  getDb().prepare('UPDATE players SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(Number(sortOrder), Number(id));
}

function deletePlayerById(id: number | string): void {
  getDb().prepare('DELETE FROM players WHERE id = ?').run(Number(id));
}

function countGamePlayersByPlayerId(id: number | string): number {
  return (getDb().prepare('SELECT COUNT(*) AS count FROM game_players WHERE player_id = ?').get(Number(id)) as { count: number }).count;
}

function nullifyPlayerModelRefs(modelId: number | string): void {
  getDb().prepare('UPDATE players SET model_id = NULL WHERE model_id = ?').run(Number(modelId));
}

function nullifyPlayerVoiceRefs(voiceId: number | string): void {
  getDb().prepare('UPDATE players SET voice_package_id = NULL WHERE voice_package_id = ?').run(Number(voiceId));
}

export {
  findPlayerById,
  findAllPlayers,
  getNextPlayerId,
  insertPlayer,
  updatePlayerEnabled,
  updatePlayerSortOrder,
  deletePlayerById,
  countGamePlayersByPlayerId,
  nullifyPlayerModelRefs,
  nullifyPlayerVoiceRefs
};
