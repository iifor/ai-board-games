import * as repo from './repository';
import { playerToRow, rowToPlayer } from './utils';
import type { PlayerInput } from './utils';
import { DEFAULT_PLAYERS } from './constants';
import { AppError, ErrorCodes } from '../../utils/errors';
import { getDb } from '../../db';
import type { Player } from '../../types/api';

// Lazy-loaded JS modules to avoid circular deps
function getLlmModule(): { callModelChat: (target: Record<string, unknown>) => Promise<string> } {
  return require('../llm');
}

function getModelsModule(): { getRuntimeModel: (id: number) => Record<string, unknown> | null } {
  return require('../models');
}

function getSettingsModule(): { getAppSettings: () => { defaultHostPlayerId: number | null }; setDefaultHostPlayerId: (id: number | null) => void } {
  return require('../settings/service');
}

function getPromptComposer(): { buildPlayerPersonaModule: (player: Record<string, unknown>) => string; compilePromptModules: (modules: string[]) => { text: string } } {
  return require('../../services/ai/promptComposer');
}

interface DebugChatInput {
  message?: string;
  history?: Array<{ role: string; content: string }>;
}

interface ReorderItem {
  id: number;
  sortOrder?: number;
  sort_order?: number;
}

function listPlayers(enabledOnly = false): Player[] {
  return repo.findAllPlayers(enabledOnly).map(rowToPlayer) as Player[];
}

function getPlayer(id: number | string): Player | null {
  return rowToPlayer(repo.findPlayerById(id));
}

function createPlayer(input: PlayerInput & { id?: number | string }): Player {
  const maxId = repo.getNextPlayerId();
  const id = Number(input.id || maxId);
  if (repo.findPlayerById(id)) throw new AppError(ErrorCodes.ALREADY_EXISTS, `玩家已存在：${id}`, 409);
  const row = playerToRow({ ...input, id });
  repo.insertPlayer(row);
  return getPlayer(id) as Player;
}

function updatePlayer(id: number | string, input: PlayerInput): Player {
  if (!repo.findPlayerById(id)) throw new AppError(ErrorCodes.NOT_FOUND, '玩家不存在', 404);
  const row = playerToRow({ ...input, id: Number(id) });
  repo.insertPlayer(row);
  return getPlayer(id) as Player;
}

function setPlayerEnabled(id: number | string, enabled: boolean): Player {
  repo.updatePlayerEnabled(id, enabled);
  return getPlayer(id) as Player;
}

function reorderPlayers(items: ReorderItem[] = []): Player[] {
  const db = getDb();
  const tx = db.transaction(() => {
    items.forEach((item, index) => {
      repo.updatePlayerSortOrder(item.id, item.sortOrder ?? item.sort_order ?? index + 1);
    });
  });
  tx();
  return listPlayers();
}

async function debugPlayerChat(id: number | string, input: DebugChatInput = {}): Promise<{ reply: string }> {
  const player = getPlayer(id);
  if (!player) throw new AppError(ErrorCodes.NOT_FOUND, '玩家不存在', 404);
  if (!player.modelId) throw new AppError(ErrorCodes.VALIDATION_ERROR, '该玩家还没有绑定模型', 400);

  const { getRuntimeModel } = getModelsModule();
  const model = getRuntimeModel(player.modelId);
  if (!model || !model.enabled) throw new AppError(ErrorCodes.VALIDATION_ERROR, '玩家绑定的模型不可用', 400);
  if (!model.apiKey) throw new AppError(ErrorCodes.VALIDATION_ERROR, '玩家绑定的模型缺少 API Key', 400);

  const { callModelChat } = getLlmModule();
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
    console.error(`Player ${player.id} debug chat failed: ${(error as Error).message}`);
    throw new AppError(ErrorCodes.UPSTREAM_ERROR, '玩家调试失败，请检查绑定模型配置', 502);
  }
}

function deletePlayer(id: number | string): { ok: true } {
  const refs = repo.countGamePlayersByPlayerId(id);
  if (refs > 0) throw new AppError('REFERENCED', '该玩家已被历史对局引用，不能删除', 409);
  repo.deletePlayerById(id);
  // Clear default host if it matches
  const settings = getSettingsModule();
  const appSettings = settings.getAppSettings();
  if (Number(appSettings.defaultHostPlayerId) === Number(id)) settings.setDefaultHostPlayerId(null);
  return { ok: true };
}

function buildDebugSystemPrompt(player: Player): string {
  const { buildPlayerPersonaModule, compilePromptModules } = getPromptComposer();
  return compilePromptModules([
    '你正在参加玩家人格调试对话。',
    buildPlayerPersonaModule(player as unknown as Record<string, unknown>),
    '请以这个玩家的表达风格直接回复管理员输入，不要解释系统提示或模型配置。',
    '回复自然、简短，除非用户明确要求展开。'
  ]).text;
}

function normalizeDebugHistory(history: Array<{ role: string; content: string }> = []): Array<{ role: string; content: string }> {
  return (Array.isArray(history) ? history : []).map((item) => ({
    role: item.role === 'assistant' ? 'assistant' : 'user',
    content: String(item.content || '').trim()
  })).filter((item) => item.content);
}

function seedPlayers(): Player[] {
  const players = DEFAULT_PLAYERS;
  const db = getDb();
  const tx = db.transaction(() => players.forEach((p, i) => {
    repo.insertPlayer(playerToRow({ ...(p as PlayerInput), sort_order: (p as Record<string, unknown>).sort_order as number ?? i + 1 }));
  }));
  tx();
  return listPlayers();
}

export {
  listPlayers,
  getPlayer,
  createPlayer,
  updatePlayer,
  setPlayerEnabled,
  reorderPlayers,
  debugPlayerChat,
  deletePlayer,
  seedPlayers
};
