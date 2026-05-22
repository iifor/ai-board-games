const repo = require('./repository');
const { skinToRow, rowToSkin, slugifyId, normalizeImportedSkin, parseJson } = require('./utils');
const { BUILTIN_TEMPLATE } = require('./constants');
const { AppError, ErrorCodes } = require('../../utils/errors');
const skinEngine = require('../skin-engine');

function listSkins(enabledOnly = false) {
  return repo.findAllSkins(enabledOnly).map(rowToSkin);
}

function getSkin(id) {
  const skin = rowToSkin(repo.findSkinById(id));
  if (!skin) throw new AppError(ErrorCodes.NOT_FOUND, '皮肤不存在', 404);
  return skin;
}

function getRandomEnabledSkin(rng = Math.random) {
  const skins = listSkins(true);
  const pool = skins.length ? skins : [BUILTIN_TEMPLATE];
  return pool[Math.floor(rng() * pool.length)];
}

function createSkin(input) {
  const id = input.id || slugifyId(input.name);
  if (repo.findSkinById(id)) throw new AppError(ErrorCodes.ALREADY_EXISTS, `皮肤已存在：${id}`, 409);
  const row = skinToRow({ ...input, id, source: input.source || 'admin', enabled: input.enabled !== false });
  repo.insertSkin(row);
  return getSkin(id);
}

function updateSkin(id, input) {
  if (!repo.findSkinById(id)) throw new AppError(ErrorCodes.NOT_FOUND, '皮肤不存在', 404);
  const row = skinToRow({ ...input, id, source: input.source || 'admin', enabled: input.enabled !== false });
  repo.insertSkin(row);
  return getSkin(id);
}

function setSkinEnabled(id, enabled) {
  if (!repo.findSkinById(id)) throw new AppError(ErrorCodes.NOT_FOUND, '皮肤不存在', 404);
  repo.updateSkinEnabled(id, enabled);
  return getSkin(id);
}

function deleteSkin(id) {
  const refs = repo.countGamesBySkin(id);
  if (refs > 0) throw new AppError('REFERENCED', '该皮肤已被历史对局引用，不能删除', 409);
  repo.deleteSkinById(id);
  return { ok: true };
}

function importMarkdownSkins() {
  const templates = skinEngine.getMarkdownSkinTemplates();
  const skins = templates.length ? templates : [BUILTIN_TEMPLATE];
  const db = require('../../db').getDb();
  const tx = db.transaction(() => skins.forEach((skin) => repo.insertSkin(skinToRow(skin))));
  tx();
  return listSkins();
}

function importSkinJson(input) {
  const skin = typeof input?.raw === 'string' ? (() => {
    try { return JSON.parse(input.raw); } catch { throw new AppError('IMPORT_ERROR', '皮肤导入失败：JSON 格式不正确。', 400); }
  })() : input;
  const normalized = normalizeImportedSkin(skin);
  repo.insertSkin(skinToRow(normalized));
  return listSkins();
}

module.exports = { listSkins, getSkin, getRandomEnabledSkin, createSkin, updateSkin, setSkinEnabled, deleteSkin, importMarkdownSkins, importSkinJson };
