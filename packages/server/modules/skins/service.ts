import * as repo from './repository';
import { skinToRow, rowToSkin, slugifyId, normalizeImportedSkin } from './utils';
import { BUILTIN_TEMPLATE } from './constants';
import { AppError, ErrorCodes } from '../../utils/errors';
import { getDb } from '../../db';
import type { Skin } from '../../types/api';
import type { SkinTemplateInput } from './utils';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const skinEngine = require('../skin-engine') as { getMarkdownSkinTemplates: () => SkinTemplateInput[] };

function listSkins(enabledOnly = false): Skin[] {
  return repo.findAllSkins(enabledOnly).map(rowToSkin).filter((s): s is Skin => s !== null);
}

function getSkin(id: string): Skin {
  const skin = rowToSkin(repo.findSkinById(id));
  if (!skin) throw new AppError(ErrorCodes.NOT_FOUND, '皮肤不存在', 404);
  return skin;
}

function getRandomEnabledSkin(rng: () => number = Math.random): Skin {
  const skins = listSkins(true);
  const pool = skins.length ? skins : [BUILTIN_TEMPLATE as unknown as Skin];
  return pool[Math.floor(rng() * pool.length)];
}

function createSkin(input: Partial<SkinTemplateInput>): Skin {
  const id = input.id || slugifyId(input.name);
  if (repo.findSkinById(id)) throw new AppError(ErrorCodes.ALREADY_EXISTS, `皮肤已存在：${id}`, 409);
  const row = skinToRow({ ...input, id, source: input.source || 'admin', enabled: input.enabled !== false } as SkinTemplateInput);
  repo.insertSkin(row);
  return getSkin(id);
}

function updateSkin(id: string, input: Partial<SkinTemplateInput>): Skin {
  if (!repo.findSkinById(id)) throw new AppError(ErrorCodes.NOT_FOUND, '皮肤不存在', 404);
  const row = skinToRow({ ...input, id, source: input.source || 'admin', enabled: input.enabled !== false } as SkinTemplateInput);
  repo.insertSkin(row);
  return getSkin(id);
}

function setSkinEnabled(id: string, enabled: boolean): Skin {
  if (!repo.findSkinById(id)) throw new AppError(ErrorCodes.NOT_FOUND, '皮肤不存在', 404);
  repo.updateSkinEnabled(id, enabled);
  return getSkin(id);
}

function deleteSkin(id: string): { ok: boolean } {
  const refs = repo.countGamesBySkin(id);
  if (refs > 0) throw new AppError('REFERENCED', '该皮肤已被历史对局引用，不能删除', 409);
  repo.deleteSkinById(id);
  return { ok: true };
}

function importMarkdownSkins(): Skin[] {
  const templates = skinEngine.getMarkdownSkinTemplates();
  const skins: SkinTemplateInput[] = templates.length ? templates : [BUILTIN_TEMPLATE as unknown as SkinTemplateInput];
  const db = getDb();
  const tx = db.transaction(() => skins.forEach((skin) => repo.insertSkin(skinToRow(skin))));
  tx();
  return listSkins();
}

function importSkinJson(input: { raw?: string; [key: string]: unknown } | Record<string, unknown>): Skin[] {
  const rawObj = input as { raw?: string };
  const skin = typeof rawObj?.raw === 'string' ? (() => {
    try { return JSON.parse(rawObj.raw); } catch { throw new AppError('IMPORT_ERROR', '皮肤导入失败：JSON 格式不正确。', 400); }
  })() : input;
  const normalized = normalizeImportedSkin(skin);
  repo.insertSkin(skinToRow(normalized));
  return listSkins();
}

export { listSkins, getSkin, getRandomEnabledSkin, createSkin, updateSkin, setSkinEnabled, deleteSkin, importMarkdownSkins, importSkinJson };
