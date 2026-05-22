const repo = require('./repository');
const { playerToRow, rowToPlayer } = require('./utils');
const { DEFAULT_PLAYERS } = require('./constants');
const { AppError, ErrorCodes } = require('../../utils/errors');
const { getDb } = require('../../db');
const { callModelChat } = require('../llm');
const { buildPlayerPersonaModule, compilePromptModules } = require('../../services/ai/promptComposer');

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

async function debugPlayerChat(id, input = {}) {
  const player = getPlayer(id);
  if (!player) throw new AppError(ErrorCodes.NOT_FOUND, '玩家不存在', 404);
  if (!player.modelId) throw new AppError(ErrorCodes.VALIDATION_ERROR, '该玩家还没有绑定模型', 400);

  const model = require('../models').getRuntimeModel(player.modelId);
  if (!model || !model.enabled) throw new AppError(ErrorCodes.VALIDATION_ERROR, '玩家绑定的模型不可用', 400);
  if (!model.apiKey) throw new AppError(ErrorCodes.VALIDATION_ERROR, '玩家绑定的模型缺少 API Key', 400);

  const messages = [
    { role: 'system', content: buildDebugSystemPrompt(player) },
    ...normalizeDebugHistory(input.history),
    { role: 'user', content: input.message }
  ];

  try {
    const reply = await callModelChat({
      ...model,
      model: model.name,
      messages,
      temperature: Number(player.temperature ?? 0.85),
      maxTokens: 260
    });
    return { reply: String(reply || '').trim() };
  } catch (error) {
    console.error(`Player ${player.id} debug chat failed: ${error.message}`);
    throw new AppError(ErrorCodes.UPSTREAM_ERROR, '玩家调试失败，请检查绑定模型配置', 502);
  }
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

function buildDebugSystemPrompt(player) {
  return compilePromptModules([
    '你正在参加玩家人格调试对话。',
    buildPlayerPersonaModule(player),
    '请以这个玩家的表达风格直接回复管理员输入，不要解释系统提示或模型配置。',
    '回复自然、简短，除非用户明确要求展开。'
  ]).text;
}

function normalizeDebugHistory(history = []) {
  return (Array.isArray(history) ? history : []).map((item) => ({
    role: item.role === 'assistant' ? 'assistant' : 'user',
    content: String(item.content || '').trim()
  })).filter((item) => item.content);
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

module.exports = {
  listPlayers, getPlayer, createPlayer, updatePlayer, setPlayerEnabled,
  reorderPlayers, debugPlayerChat, deletePlayer, seedPlayers
};
