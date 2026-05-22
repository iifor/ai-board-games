const repo = require('./repository');
const { playerToRow, rowToPlayer } = require('./utils');
const { DEFAULT_PLAYERS } = require('./constants');
const { AppError, ErrorCodes } = require('../../utils/errors');
const { getDb } = require('../../db');

function listPlayers(enabledOnly = false) {
  return repo.findAllPlayers(enabledOnly).map(rowToPlayer);
}

function getPlayer(id) {
  return rowToPlayer(repo.findPlayerById(id));
}

function createPlayer(input) {
  const maxId = repo.getNextPlayerId();
  const id = Number(input.id || maxId);
  if (repo.findPlayerById(id)) throw new AppError(ErrorCodes.ALREADY_EXISTS, `玩家已存在：${id}`, 409);
  const row = playerToRow({ ...input, id });
  repo.insertPlayer(row);
  return getPlayer(id);
}

function updatePlayer(id, input) {
  if (!repo.findPlayerById(id)) throw new AppError(ErrorCodes.NOT_FOUND, '玩家不存在', 404);
  const row = playerToRow({ ...input, id: Number(id) });
  repo.insertPlayer(row);
  return getPlayer(id);
}

function setPlayerEnabled(id, enabled) {
  repo.updatePlayerEnabled(id, enabled);
  return getPlayer(id);
}

function reorderPlayers(items = []) {
  const db = getDb();
  const tx = db.transaction(() => {
    items.forEach((item, index) => {
      repo.updatePlayerSortOrder(item.id, item.sortOrder ?? item.sort_order ?? index + 1);
    });
  });
  tx();
  return listPlayers();
}

function deletePlayer(id) {
  const refs = repo.countGamePlayersByPlayerId(id);
  if (refs > 0) throw new AppError('REFERENCED', '该玩家已被历史对局引用，不能删除', 409);
  repo.deletePlayerById(id);
  // Clear default host if it matches
  const settings = require('../settings/service');
  const appSettings = settings.getAppSettings();
  if (Number(appSettings.defaultHostPlayerId) === Number(id)) settings.setDefaultHostPlayerId(null);
  return { ok: true };
}

function seedPlayers() {
  const players = DEFAULT_PLAYERS;
  const db = getDb();
  const tx = db.transaction(() => players.forEach((p, i) => {
    repo.insertPlayer(playerToRow({ ...p, sort_order: p.sort_order ?? i + 1 }));
  }));
  tx();
  return listPlayers();
}

module.exports = { listPlayers, getPlayer, createPlayer, updatePlayer, setPlayerEnabled, reorderPlayers, deletePlayer, seedPlayers };
