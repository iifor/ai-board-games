import * as repo from './repository';
import { rowToWerewolfRole, werewolfRoleToRow, rowToWerewolfMode, werewolfModeToRow } from './utils';
import { AppError, ErrorCodes } from '../../utils/errors';
import type { WerewolfRole, WerewolfMode } from '../../types/api';

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

interface ResolvedRole extends WerewolfRole {
  count: number;
}

interface WerewolfModeConfig extends WerewolfMode {
  resolvedRoles: ResolvedRole[];
  roleMap: Record<string, WerewolfRole>;
  totalPlayers: number;
}

// Roles
function listWerewolfRoles(): WerewolfRole[] {
  return repo.findAllRoles().map((row) => rowToWerewolfRole(row)!);
}

function getWerewolfRole(id: string): WerewolfRole | null {
  return rowToWerewolfRole(repo.findRoleById(id));
}

function upsertWerewolfRole(input: WerewolfRoleInput): WerewolfRole | null {
  const row = werewolfRoleToRow(input);
  repo.insertRole(row);
  return getWerewolfRole(row.id);
}

function deleteWerewolfRole(id: string): { ok: true } {
  const refs = repo.countModesByRoleId(id);
  if (refs > 0) throw new AppError('REFERENCED', '该角色已被狼人杀模式引用，不能删除', 409);
  repo.deleteRoleById(id);
  return { ok: true };
}

// Modes
function listWerewolfModes(): WerewolfMode[] {
  return repo.findAllModes().map((row) => rowToWerewolfMode(row)!);
}

function getWerewolfMode(id: string): WerewolfMode | null {
  return rowToWerewolfMode(repo.findModeById(id));
}

function upsertWerewolfMode(input: WerewolfModeInput): WerewolfMode | null {
  const row = werewolfModeToRow(input);
  repo.insertMode(row);
  return getWerewolfMode(row.id);
}

function deleteWerewolfMode(id: string): { ok: true } {
  repo.deleteModeById(id);
  return { ok: true };
}

// Mode config builder
interface ModeRoleEntry {
  roleId: string;
  count: number;
}

function getWerewolfModeConfig(modeId: string | { id?: string; modeId?: string }): WerewolfModeConfig {
  const id = typeof modeId === 'string' ? modeId : (modeId?.id || modeId?.modeId || 'standard');
  const mode = getWerewolfMode(id);
  if (!mode) throw new AppError(ErrorCodes.NOT_FOUND, '狼人杀模式不存在', 404);

  const roles = listWerewolfRoles();
  const roleMap: Record<string, WerewolfRole> = {};
  roles.forEach((r) => { roleMap[r.id] = r; });

  const resolvedRoles: ResolvedRole[] = (mode.roles as ModeRoleEntry[]).map((entry) => ({
    ...roleMap[entry.roleId],
    count: entry.count
  }));

  const totalPlayers = resolvedRoles.reduce((sum, r) => sum + (r.count || 0), 0);

  return {
    ...mode,
    resolvedRoles,
    roleMap,
    totalPlayers,
    sheriff: mode.sheriff || {}
  };
}

export {
  listWerewolfRoles, getWerewolfRole, upsertWerewolfRole, deleteWerewolfRole,
  listWerewolfModes, getWerewolfMode, upsertWerewolfMode, deleteWerewolfMode,
  getWerewolfModeConfig
};
