import { getDb } from '../../db';
import type { WerewolfRoleRow, WerewolfModeRow } from '../../types/database';

function findRoleById(id: string): WerewolfRoleRow | null {
  const row = getDb().prepare('SELECT * FROM werewolf_roles WHERE id = ?').get(String(id)) as WerewolfRoleRow | undefined;
  return row || null;
}

function findAllRoles(): WerewolfRoleRow[] {
  return getDb().prepare('SELECT * FROM werewolf_roles ORDER BY sort_order ASC').all() as WerewolfRoleRow[];
}

interface WerewolfRoleInsertParams {
  id: string;
  name: string;
  faction: string;
  role_type: string;
  responsibility: string;
  ability: string;
  play_style_advice: string;
  key_info: string;
  rule_json: string;
  enabled: number;
  sort_order: number;
}

function insertRole(row: WerewolfRoleInsertParams): void {
  getDb().prepare(`
    INSERT INTO werewolf_roles (id, name, faction, role_type, responsibility, ability, play_style_advice, key_info, rule_json, enabled, sort_order, created_at, updated_at)
    VALUES (@id, @name, @faction, @role_type, @responsibility, @ability, @play_style_advice, @key_info, @rule_json, @enabled, @sort_order, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, faction = excluded.faction, role_type = excluded.role_type,
      responsibility = excluded.responsibility, ability = excluded.ability,
      play_style_advice = excluded.play_style_advice, key_info = excluded.key_info,
      rule_json = excluded.rule_json, enabled = excluded.enabled, sort_order = excluded.sort_order,
      updated_at = CURRENT_TIMESTAMP
  `).run(row);
}

function deleteRoleById(id: string): void {
  getDb().prepare('DELETE FROM werewolf_roles WHERE id = ?').run(String(id));
}

function findModeById(id: string): WerewolfModeRow | null {
  const row = getDb().prepare('SELECT * FROM werewolf_modes WHERE id = ?').get(String(id)) as WerewolfModeRow | undefined;
  return row || null;
}

function findAllModes(): WerewolfModeRow[] {
  return getDb().prepare('SELECT * FROM werewolf_modes ORDER BY sort_order ASC').all() as WerewolfModeRow[];
}

function countModesByRoleId(roleId: string): number {
  const row = getDb().prepare("SELECT COUNT(*) AS count FROM werewolf_modes WHERE roles_json LIKE ?").get(`%${roleId}%`) as { count: number } | undefined;
  return row ? row.count : 0;
}

interface WerewolfModeInsertParams {
  id: string;
  name: string;
  description: string;
  roles_json: string;
  rules_json: string;
  sheriff_json: string;
  win_condition: string;
  enabled: number;
  sort_order: number;
}

function insertMode(row: WerewolfModeInsertParams): void {
  getDb().prepare(`
    INSERT INTO werewolf_modes (id, name, description, roles_json, rules_json, sheriff_json, win_condition, enabled, sort_order, created_at, updated_at)
    VALUES (@id, @name, @description, @roles_json, @rules_json, @sheriff_json, @win_condition, @enabled, @sort_order, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, description = excluded.description, roles_json = excluded.roles_json,
      rules_json = excluded.rules_json, sheriff_json = excluded.sheriff_json,
      win_condition = excluded.win_condition, enabled = excluded.enabled, sort_order = excluded.sort_order,
      updated_at = CURRENT_TIMESTAMP
  `).run(row);
}

function deleteModeById(id: string): void {
  getDb().prepare('DELETE FROM werewolf_modes WHERE id = ?').run(String(id));
}

export {
  findRoleById, findAllRoles, insertRole, deleteRoleById,
  findModeById, findAllModes, countModesByRoleId, insertMode, deleteModeById
};
