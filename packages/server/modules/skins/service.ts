import * as repo from './repository';
import { skinToRow, rowToSkin, slugifyId, normalizeImportedSkin } from './utils';
import { BUILTIN_TEMPLATE } from './constants';
import { AppError, ErrorCodes } from '../../utils/errors';
import { getDbExecutor } from '../../db';
import type { Skin } from '../../types/api';
import type { SkinTemplateInput } from './utils';
import { getMarkdownSkinTemplates } from '../skin-engine';

async function listSkins(enabledOnly = false): Promise<Skin[]> {
  return (await repo.findAllSkins(enabledOnly)).map(rowToSkin).filter((skin): skin is Skin => skin !== null);
}
async function getSkin(id: string): Promise<Skin> {
  const skin = rowToSkin(await repo.findSkinById(id));
  if (!skin) throw new AppError(ErrorCodes.NOT_FOUND, '皮肤不存在', 404);
  return skin;
}
async function getRandomEnabledSkin(rng: () => number = Math.random): Promise<Skin> {
  const skins = await listSkins(true);
  const pool = skins.length ? skins : [BUILTIN_TEMPLATE as unknown as Skin];
  return pool[Math.floor(rng() * pool.length)];
}
async function createSkin(input: Partial<SkinTemplateInput>): Promise<Skin> {
  const id = input.id || slugifyId(input.name);
  if (await repo.findSkinById(id)) throw new AppError(ErrorCodes.ALREADY_EXISTS, `皮肤已存在：${id}`, 409);
  await repo.insertSkin(skinToRow({ ...input, id, source: input.source || 'admin', enabled: input.enabled !== false } as SkinTemplateInput));
  return getSkin(id);
}
async function updateSkin(id: string, input: Partial<SkinTemplateInput>): Promise<Skin> {
  if (!await repo.findSkinById(id)) throw new AppError(ErrorCodes.NOT_FOUND, '皮肤不存在', 404);
  await repo.insertSkin(skinToRow({ ...input, id, source: input.source || 'admin', enabled: input.enabled !== false } as SkinTemplateInput));
  return getSkin(id);
}
async function setSkinEnabled(id: string, enabled: boolean): Promise<Skin> {
  if (!await repo.findSkinById(id)) throw new AppError(ErrorCodes.NOT_FOUND, '皮肤不存在', 404);
  await repo.updateSkinEnabled(id, enabled);
  return getSkin(id);
}
async function deleteSkin(id: string): Promise<{ ok: boolean }> {
  if (await repo.countGamesBySkin(id) > 0) throw new AppError('REFERENCED', '该皮肤已被历史对局引用，不能删除', 409);
  await repo.deleteSkinById(id);
  return { ok: true };
}
async function importMarkdownSkins(): Promise<Skin[]> {
  const templates = getMarkdownSkinTemplates() as unknown as SkinTemplateInput[];
  const skins = templates.length ? templates : [BUILTIN_TEMPLATE as unknown as SkinTemplateInput];
  await getDbExecutor().withTransaction(async (transaction) => {
    for (const skin of skins) await repo.insertSkin(skinToRow(skin), transaction);
  });
  return listSkins();
}
async function importSkinJson(input: { raw?: string; [key: string]: unknown } | Record<string, unknown>): Promise<Skin[]> {
  const rawObj = input as { raw?: string };
  const skin = typeof rawObj?.raw === 'string' ? (() => {
    try { return JSON.parse(rawObj.raw); } catch { throw new AppError('IMPORT_ERROR', '皮肤导入失败：JSON 格式不正确。', 400); }
  })() : input;
  await repo.insertSkin(skinToRow(normalizeImportedSkin(skin)));
  return listSkins();
}

export { listSkins, getSkin, getRandomEnabledSkin, createSkin, updateSkin, setSkinEnabled,
  deleteSkin, importMarkdownSkins, importSkinJson };
