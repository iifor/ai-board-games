import { parseJson, toJson } from './utils';
import * as repo from './repository';
import { SETTING_KEYS } from './constants';
import { AppError, ErrorCodes } from '../../utils/errors';

function getAppSettings(): { defaultHostPlayerId: number | null } {
  return { defaultHostPlayerId: parseJson<number | null>(repo.getSettingValue(SETTING_KEYS.DEFAULT_HOST), null) };
}

function setDefaultHostPlayerId(playerId: unknown): { defaultHostPlayerId: number | null } {
  const value = Number(playerId) || null;
  if (value) {
    const playerRepo = require('../players/repository');
    if (!playerRepo.findPlayerById(value)) throw new AppError(ErrorCodes.NOT_FOUND, '默认主持人玩家不存在', 404);
  }
  repo.upsertSetting(SETTING_KEYS.DEFAULT_HOST, toJson(value));
  return getAppSettings();
}

function getSpectatorMode(): boolean {
  return parseJson<boolean>(repo.getSettingValue(SETTING_KEYS.SPECTATOR_MODE), false);
}

function setSpectatorMode(enabled: unknown): { spectatorMode: boolean } {
  const value = Boolean(enabled);
  repo.upsertSetting(SETTING_KEYS.SPECTATOR_MODE, toJson(value));
  return { spectatorMode: value };
}

export { getAppSettings, setDefaultHostPlayerId, getSpectatorMode, setSpectatorMode };
