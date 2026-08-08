import * as repo from './repository';
import { rowToWerewolfRole, werewolfRoleToRow, rowToWerewolfMode, werewolfModeToRow } from './utils';
import { DEFAULT_WEREWOLF_MODES, DEFAULT_WEREWOLF_ROLES } from './constants';
import { AppError, ErrorCodes } from '../../utils/errors';
import type { WerewolfRole, WerewolfMode } from '../../types/api';

interface WerewolfRoleInput { id?: string; name?: string; faction?: string; roleType?: string; role_type?: string; responsibility?: string; ability?: string; playStyleAdvice?: string; play_style_advice?: string; keyInfo?: string; key_info?: string; rule?: Record<string, unknown>; enabled?: boolean; sortOrder?: number; sort_order?: number }
interface WerewolfModeInput { id?: string; name?: string; description?: string; roles?: unknown[]; rules?: Record<string, unknown>; sheriff?: Record<string, unknown>; winCondition?: string; win_condition?: string; enabled?: boolean; sortOrder?: number; sort_order?: number }
interface ResolvedRole extends WerewolfRole { count: number }
interface WerewolfModeConfig extends WerewolfMode { resolvedRoles: ResolvedRole[]; roleMap: Record<string, WerewolfRole>; totalPlayers: number }
interface ModeRoleEntry { roleId: string; count: number }

async function listWerewolfRoles(): Promise<WerewolfRole[]> {
  const rows = (await repo.findAllRoles()).map((row) => rowToWerewolfRole(row)!);
  return rows.length ? rows : DEFAULT_WEREWOLF_ROLES as unknown as WerewolfRole[];
}
async function getWerewolfRole(id: string): Promise<WerewolfRole | null> {
  return rowToWerewolfRole(await repo.findRoleById(id))
    || (DEFAULT_WEREWOLF_ROLES.find((role) => role.id === id) as unknown as WerewolfRole | undefined) || null;
}
async function upsertWerewolfRole(input: WerewolfRoleInput): Promise<WerewolfRole | null> {
  const row = werewolfRoleToRow(input);
  await repo.insertRole(row);
  return getWerewolfRole(row.id);
}
async function deleteWerewolfRole(id: string): Promise<{ ok: true }> {
  if (await repo.countModesByRoleId(id) > 0) throw new AppError('REFERENCED', '该角色已被狼人杀模式引用，不能删除', 409);
  await repo.deleteRoleById(id);
  return { ok: true };
}
async function listWerewolfModes(): Promise<WerewolfMode[]> {
  const rows = (await repo.findAllModes()).map((row) => rowToWerewolfMode(row)!);
  return rows.length ? rows : DEFAULT_WEREWOLF_MODES as unknown as WerewolfMode[];
}
async function getWerewolfMode(id: string): Promise<WerewolfMode | null> {
  return rowToWerewolfMode(await repo.findModeById(id))
    || (DEFAULT_WEREWOLF_MODES.find((mode) => mode.id === id) as unknown as WerewolfMode | undefined) || null;
}
async function upsertWerewolfMode(input: WerewolfModeInput): Promise<WerewolfMode | null> {
  const row = werewolfModeToRow(input);
  await repo.insertMode(row);
  return getWerewolfMode(row.id);
}
async function deleteWerewolfMode(id: string): Promise<{ ok: true }> {
  await repo.deleteModeById(id);
  return { ok: true };
}
async function getWerewolfModeConfig(modeId: string | { id?: string; modeId?: string }): Promise<WerewolfModeConfig> {
  const id = typeof modeId === 'string' ? modeId : (modeId?.id || modeId?.modeId || 'standard');
  const mode = await getWerewolfMode(id);
  if (!mode) throw new AppError(ErrorCodes.NOT_FOUND, '狼人杀模式不存在', 404);
  const roles = await listWerewolfRoles();
  const roleMap: Record<string, WerewolfRole> = {};
  roles.forEach((role) => { roleMap[role.id] = role; });
  const resolvedRoles: ResolvedRole[] = (mode.roles as ModeRoleEntry[]).map((entry) => ({ ...roleMap[entry.roleId], count: entry.count }));
  return { ...mode, resolvedRoles, roleMap,
    totalPlayers: resolvedRoles.reduce((sum, role) => sum + (role.count || 0), 0),
    sheriff: mode.sheriff || {} };
}

export { listWerewolfRoles, getWerewolfRole, upsertWerewolfRole, deleteWerewolfRole,
  listWerewolfModes, getWerewolfMode, upsertWerewolfMode, deleteWerewolfMode,
  getWerewolfModeConfig };
