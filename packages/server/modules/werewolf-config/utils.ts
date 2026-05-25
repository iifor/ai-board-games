import type { WerewolfRole, WerewolfMode } from '../../types/api';
import type { WerewolfRoleRow, WerewolfModeRow } from '../../types/database';

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function slugifyPlainId(text: string): string {
  return String(text || 'id').toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '').slice(0, 64);
}

const EXECUTABLE_WEREWOLF_ACTIONS = new Set(['kill', 'inspectFaction', 'save', 'poison', 'guard', 'shootOnDeath', 'surviveExileOnce', 'voteOnly', 'speakOnly']);

function normalizeWerewolfFaction(value: unknown): string {
  const factions = ['good', 'wolves'];
  const text = String(value || '').toLowerCase().trim();
  return factions.includes(text) ? text : 'good';
}

function normalizeWerewolfRoleType(value: unknown): string {
  const types = ['god', 'wolf', 'villager'];
  const text = String(value || '').toLowerCase().trim();
  return types.includes(text) ? text : 'villager';
}

function normalizeWerewolfWinCondition(value: unknown): string {
  return value === 'single' ? 'single' : 'side';
}

interface WerewolfRuleAction {
  action?: string;
  trigger?: string;
  targetRule?: string;
  group?: string;
  limit?: string;
  disabledDeathReasons?: string[];
}

function validateWerewolfRoleRule(rule: unknown): void {
  if (!rule || typeof rule !== 'object') return;
  const actions: WerewolfRuleAction[] = Array.isArray((rule as Record<string, unknown>).actions) ? (rule as Record<string, WerewolfRuleAction[]>).actions : [];
  for (const action of actions) {
    if (!action.action || !EXECUTABLE_WEREWOLF_ACTIONS.has(action.action)) {
      throw new Error(`无效的狼人杀行动：${action.action}`);
    }
  }
}

function rowToWerewolfRole(row: WerewolfRoleRow | null): WerewolfRole | null {
  if (!row) return null;
  return {
    id: row.id, name: row.name, faction: row.faction, roleType: row.role_type,
    responsibility: row.responsibility, ability: row.ability,
    playStyleAdvice: row.play_style_advice || '', keyInfo: row.key_info,
    rule: parseJson<Record<string, unknown>>(row.rule_json, {}), enabled: Boolean(row.enabled),
    sortOrder: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

interface WerewolfRoleInput {
  id?: string;
  name?: string;
  faction?: string;
  roleType?: string;
  role_type?: string;
  responsibility?: string;
  ability?: string;
  playStyleAdvice?: string;
  play_style_advice?: string;
  keyInfo?: string;
  key_info?: string;
  rule?: Record<string, unknown>;
  enabled?: boolean;
  sortOrder?: number;
  sort_order?: number;
}

function werewolfRoleToRow(input: WerewolfRoleInput): WerewolfRoleRow {
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
    sort_order: Number(input.sortOrder ?? input.sort_order ?? 0),
    created_at: '',
    updated_at: ''
  };
}

function rowToWerewolfMode(row: WerewolfModeRow | null): WerewolfMode | null {
  if (!row) return null;
  return {
    id: row.id, name: row.name, description: row.description,
    roles: parseJson<unknown[]>(row.roles_json, []),
    rules: parseJson<Record<string, unknown>>(row.rules_json, {}),
    sheriff: parseJson<Record<string, unknown>>(row.sheriff_json, {}),
    winCondition: row.win_condition,
    enabled: Boolean(row.enabled), sortOrder: row.sort_order,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

interface WerewolfModeInput {
  id?: string;
  name?: string;
  description?: string;
  roles?: unknown[];
  rules?: Record<string, unknown>;
  sheriff?: Record<string, unknown>;
  winCondition?: string;
  win_condition?: string;
  enabled?: boolean;
  sortOrder?: number;
  sort_order?: number;
}

function werewolfModeToRow(input: WerewolfModeInput): WerewolfModeRow {
  return {
    id: String(input.id || slugifyPlainId(input.name || 'mode')).trim(),
    name: String(input.name || '').trim(),
    description: String(input.description || '').trim(),
    roles_json: toJson(input.roles || []),
    rules_json: toJson(input.rules || {}),
    sheriff_json: toJson(input.sheriff || {}),
    win_condition: normalizeWerewolfWinCondition(input.winCondition || input.win_condition),
    enabled: Number(input.enabled !== false),
    sort_order: Number(input.sortOrder ?? input.sort_order ?? 0),
    created_at: '',
    updated_at: ''
  };
}

export {
  parseJson, toJson, slugifyPlainId, EXECUTABLE_WEREWOLF_ACTIONS,
  normalizeWerewolfFaction, normalizeWerewolfRoleType, normalizeWerewolfWinCondition,
  validateWerewolfRoleRule, rowToWerewolfRole, werewolfRoleToRow,
  rowToWerewolfMode, werewolfModeToRow
};
