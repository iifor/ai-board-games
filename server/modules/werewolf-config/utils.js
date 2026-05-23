function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}
function toJson(value) { return JSON.stringify(value ?? null); }
function slugifyPlainId(text) {
  return String(text || 'id').toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '').slice(0, 64);
}

const EXECUTABLE_WEREWOLF_ACTIONS = new Set(['kill', 'inspectFaction', 'save', 'poison', 'guard', 'shootOnDeath', 'surviveExileOnce', 'voteOnly', 'speakOnly']);

function normalizeWerewolfFaction(value) {
  const factions = ['good', 'wolves'];
  const text = String(value || '').toLowerCase().trim();
  return factions.includes(text) ? text : 'good';
}

function normalizeWerewolfRoleType(value) {
  const types = ['god', 'wolf', 'villager'];
  const text = String(value || '').toLowerCase().trim();
  return types.includes(text) ? text : 'villager';
}

function normalizeWerewolfWinCondition(value) {
  return value === 'single' ? 'single' : 'side';
}

function validateWerewolfRoleRule(rule) {
  if (!rule || typeof rule !== 'object') return;
  const actions = Array.isArray(rule.actions) ? rule.actions : [];
  for (const action of actions) {
    if (!action.action || !EXECUTABLE_WEREWOLF_ACTIONS.has(action.action)) {
      throw new Error(`无效的狼人杀行动：${action.action}`);
    }
  }
}

function rowToWerewolfRole(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, faction: row.faction, roleType: row.role_type,
    responsibility: row.responsibility, ability: row.ability,
    playStyleAdvice: row.play_style_advice || '', keyInfo: row.key_info,
    rule: parseJson(row.rule_json, {}), enabled: Boolean(row.enabled),
    sortOrder: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function werewolfRoleToRow(input) {
  const rule = input.rule || {};
  validateWerewolfRoleRule(rule);
  return {
    id: String(input.id || slugifyPlainId(input.name || 'role')).trim(),
    name: String(input.name || '').trim(),
    faction: normalizeWerewolfFaction(input.faction),
    role_type: normalizeWerewolfRoleType(input.roleType || input.role_type),
    responsibility: String(input.responsibility || '').trim(),
    ability: String(input.ability || '').trim(),
    play_style_advice: String(input.playStyleAdvice || input.play_style_advice || '').trim(),
    key_info: String(input.keyInfo || input.key_info || '').trim(),
    rule_json: toJson(rule),
    enabled: Number(input.enabled !== false),
    sort_order: Number(input.sortOrder ?? input.sort_order ?? 0)
  };
}

function rowToWerewolfMode(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, description: row.description,
    roles: parseJson(row.roles_json, []),
    rules: parseJson(row.rules_json, {}),
    sheriff: parseJson(row.sheriff_json, {}),
    winCondition: row.win_condition,
    enabled: Boolean(row.enabled), sortOrder: row.sort_order,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function werewolfModeToRow(input) {
  return {
    id: String(input.id || slugifyPlainId(input.name || 'mode')).trim(),
    name: String(input.name || '').trim(),
    description: String(input.description || '').trim(),
    roles_json: toJson(input.roles || []),
    rules_json: toJson(input.rules || {}),
    sheriff_json: toJson(input.sheriff || {}),
    win_condition: normalizeWerewolfWinCondition(input.winCondition || input.win_condition),
    enabled: Number(input.enabled !== false),
    sort_order: Number(input.sortOrder ?? input.sort_order ?? 0)
  };
}

module.exports = {
  parseJson, toJson, slugifyPlainId, EXECUTABLE_WEREWOLF_ACTIONS,
  normalizeWerewolfFaction, normalizeWerewolfRoleType, normalizeWerewolfWinCondition,
  validateWerewolfRoleRule, rowToWerewolfRole, werewolfRoleToRow,
  rowToWerewolfMode, werewolfModeToRow
};
