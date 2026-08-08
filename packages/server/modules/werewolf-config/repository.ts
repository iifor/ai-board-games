import { getDbExecutor } from '../../db';
import type { WerewolfModeRow, WerewolfRoleRow } from '../../types/database';

interface WerewolfRoleInsertParams { id: string; name: string; faction: string; role_type: string; responsibility: string; ability: string; play_style_advice: string; key_info: string; rule_json: string; enabled: number; sort_order: number }
interface WerewolfModeInsertParams { id: string; name: string; description: string; roles_json: string; rules_json: string; sheriff_json: string; win_condition: string; enabled: number; sort_order: number }

async function findRoleById(id: string): Promise<WerewolfRoleRow | null> {
  return getDbExecutor().queryOne<WerewolfRoleRow>('SELECT * FROM werewolf_roles WHERE id = $1', [id]);
}
async function findAllRoles(): Promise<WerewolfRoleRow[]> {
  return getDbExecutor().queryMany<WerewolfRoleRow>('SELECT * FROM werewolf_roles ORDER BY sort_order ASC');
}
async function insertRole(row: WerewolfRoleInsertParams): Promise<void> {
  await getDbExecutor().execute(`
    INSERT INTO werewolf_roles (id, name, faction, role_type, responsibility, ability, play_style_advice, key_info, rule_json, enabled, sort_order, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, faction = excluded.faction,
      role_type = excluded.role_type, responsibility = excluded.responsibility,
      ability = excluded.ability, play_style_advice = excluded.play_style_advice,
      key_info = excluded.key_info, rule_json = excluded.rule_json, enabled = excluded.enabled,
      sort_order = excluded.sort_order, updated_at = CURRENT_TIMESTAMP
  `, [row.id, row.name, row.faction, row.role_type, row.responsibility, row.ability,
    row.play_style_advice, row.key_info, row.rule_json, row.enabled, row.sort_order]);
}
async function deleteRoleById(id: string): Promise<void> {
  await getDbExecutor().execute('DELETE FROM werewolf_roles WHERE id = $1', [id]);
}
async function findModeById(id: string): Promise<WerewolfModeRow | null> {
  return getDbExecutor().queryOne<WerewolfModeRow>('SELECT * FROM werewolf_modes WHERE id = $1', [id]);
}
async function findAllModes(): Promise<WerewolfModeRow[]> {
  return getDbExecutor().queryMany<WerewolfModeRow>('SELECT * FROM werewolf_modes ORDER BY sort_order ASC');
}
async function countModesByRoleId(roleId: string): Promise<number> {
  const row = await getDbExecutor().queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM werewolf_modes WHERE roles_json::text LIKE $1',
    [`%${roleId}%`],
  );
  return row?.count || 0;
}
async function insertMode(row: WerewolfModeInsertParams): Promise<void> {
  await getDbExecutor().execute(`
    INSERT INTO werewolf_modes (id, name, description, roles_json, rules_json, sheriff_json, win_condition, enabled, sort_order, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description,
      roles_json = excluded.roles_json, rules_json = excluded.rules_json,
      sheriff_json = excluded.sheriff_json, win_condition = excluded.win_condition,
      enabled = excluded.enabled, sort_order = excluded.sort_order, updated_at = CURRENT_TIMESTAMP
  `, [row.id, row.name, row.description, row.roles_json, row.rules_json, row.sheriff_json,
    row.win_condition, row.enabled, row.sort_order]);
}
async function deleteModeById(id: string): Promise<void> {
  await getDbExecutor().execute('DELETE FROM werewolf_modes WHERE id = $1', [id]);
}

export { findRoleById, findAllRoles, insertRole, deleteRoleById, findModeById, findAllModes,
  countModesByRoleId, insertMode, deleteModeById };
