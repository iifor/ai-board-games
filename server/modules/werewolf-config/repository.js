const { getDb } = require('../../db');

function findRoleById(id) {
  return getDb().prepare('SELECT * FROM werewolf_roles WHERE id = ?').get(String(id)) || null;
}

function findAllRoles() {
  return getDb().prepare('SELECT * FROM werewolf_roles ORDER BY sort_order ASC').all();
}

function insertRole(row) {
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

function deleteRoleById(id) {
  getDb().prepare('DELETE FROM werewolf_roles WHERE id = ?').run(String(id));
}

function findModeById(id) {
  return getDb().prepare('SELECT * FROM werewolf_modes WHERE id = ?').get(String(id)) || null;
}

function findAllModes() {
  return getDb().prepare('SELECT * FROM werewolf_modes ORDER BY sort_order ASC').all();
}

function countModesByRoleId(roleId) {
  return getDb().prepare("SELECT COUNT(*) AS count FROM werewolf_modes WHERE roles_json LIKE ?").get(`%${roleId}%`).count;
}

function insertMode(row) {
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

function deleteModeById(id) {
  getDb().prepare('DELETE FROM werewolf_modes WHERE id = ?').run(String(id));
}

module.exports = {
  findRoleById, findAllRoles, insertRole, deleteRoleById,
  findModeById, findAllModes, countModesByRoleId, insertMode, deleteModeById
};
