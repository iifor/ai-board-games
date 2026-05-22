const repo = require('./repository');
const { rowToWerewolfRole, werewolfRoleToRow, rowToWerewolfMode, werewolfModeToRow, parseJson } = require('./utils');
const { DEFAULT_WEREWOLF_ROLES, DEFAULT_WEREWOLF_MODES } = require('./constants');
const { AppError, ErrorCodes } = require('../../utils/errors');

// Roles
function listWerewolfRoles() {
  return repo.findAllRoles().map(rowToWerewolfRole);
}

function getWerewolfRole(id) {
  return rowToWerewolfRole(repo.findRoleById(id));
}

function upsertWerewolfRole(input) {
  const row = werewolfRoleToRow(input);
  repo.insertRole(row);
  return getWerewolfRole(row.id);
}

function deleteWerewolfRole(id) {
  const refs = repo.countModesByRoleId(id);
  if (refs > 0) throw new AppError('REFERENCED', '该角色已被狼人杀模式引用，不能删除', 409);
  repo.deleteRoleById(id);
  return { ok: true };
}

// Modes
function listWerewolfModes() {
  return repo.findAllModes().map(rowToWerewolfMode);
}

function getWerewolfMode(id) {
  return rowToWerewolfMode(repo.findModeById(id));
}

function upsertWerewolfMode(input) {
  const row = werewolfModeToRow(input);
  repo.insertMode(row);
  return getWerewolfMode(row.id);
}

function deleteWerewolfMode(id) {
  repo.deleteModeById(id);
  return { ok: true };
}

// Mode config builder
function getWerewolfModeConfig(modeId) {
  const id = typeof modeId === 'string' ? modeId : (modeId?.id || modeId?.modeId || 'standard');
  const mode = getWerewolfMode(id);
  if (!mode) throw new AppError(ErrorCodes.NOT_FOUND, '狼人杀模式不存在', 404);

  const roles = listWerewolfRoles();
  const roleMap = {};
  roles.forEach((r) => { roleMap[r.id] = r; });

  const resolvedRoles = mode.roles.map((entry) => ({
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

module.exports = {
  listWerewolfRoles, getWerewolfRole, upsertWerewolfRole, deleteWerewolfRole,
  listWerewolfModes, getWerewolfMode, upsertWerewolfMode, deleteWerewolfMode,
  getWerewolfModeConfig
};
