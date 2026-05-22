const { parseJson, toJson } = require('./utils');
const repo = require('./repository');
const { SETTING_KEYS } = require('./constants');
const { AppError, ErrorCodes } = require('../../utils/errors');

function getAppSettings() {
  return { defaultHostPlayerId: parseJson(repo.getSettingValue(SETTING_KEYS.DEFAULT_HOST), null) };
}

function setDefaultHostPlayerId(playerId) {
  const value = Number(playerId) || null;
  if (value) {
    const playerRepo = require('../players/repository');
    if (!playerRepo.findPlayerById(value)) throw new AppError(ErrorCodes.NOT_FOUND, '默认主持人玩家不存在', 404);
  }
  repo.upsertSetting(SETTING_KEYS.DEFAULT_HOST, toJson(value));
  return getAppSettings();
}

module.exports = { getAppSettings, setDefaultHostPlayerId };
