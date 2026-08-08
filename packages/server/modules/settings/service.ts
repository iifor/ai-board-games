import { parseJson, toJson } from './utils';
import * as repo from './repository';
import { SETTING_KEYS } from './constants';
import { AppError, ErrorCodes } from '../../utils/errors';

async function getAppSettings(): Promise<{ defaultHostPlayerId: number | null }> {
  return { defaultHostPlayerId: parseJson<number | null>(await repo.getSettingValue(SETTING_KEYS.DEFAULT_HOST), null) };
}

async function setDefaultHostPlayerId(playerId: unknown): Promise<{ defaultHostPlayerId: number | null }> {
  const value = Number(playerId) || null;
  if (value) {
    const playerRepo = require('../players/repository') as typeof import('../players/repository');
    if (!await playerRepo.findPlayerById(value)) throw new AppError(ErrorCodes.NOT_FOUND, '默认主持人玩家不存在', 404);
  }
  await repo.upsertSetting(SETTING_KEYS.DEFAULT_HOST, toJson(value));
  return getAppSettings();
}

async function getSpectatorMode(): Promise<boolean> {
  return parseJson<boolean>(await repo.getSettingValue(SETTING_KEYS.SPECTATOR_MODE), false);
}

async function setSpectatorMode(enabled: unknown): Promise<{ spectatorMode: boolean }> {
  const value = Boolean(enabled);
  await repo.upsertSetting(SETTING_KEYS.SPECTATOR_MODE, toJson(value));
  return { spectatorMode: value };
}

export { getAppSettings, setDefaultHostPlayerId, getSpectatorMode, setSpectatorMode };
