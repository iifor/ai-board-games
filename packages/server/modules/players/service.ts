import * as repo from './repository';
import { playerToRow, rowToPlayer } from './utils';
import type { PlayerInput } from './utils';
import { DEFAULT_PLAYERS } from './constants';
import { AppError, ErrorCodes } from '../../utils/errors';
import { getDbExecutor } from '../../db';
import type { Player } from '../../types/api';

function getLlmModule(): { callModelChatWithFallback(primary: Record<string, unknown> | null, fallback: Record<string, unknown> | null): Promise<string> } { return require('../llm'); }
function getModelsModule(): { getRuntimeModel(id: number): Promise<Record<string, unknown> | null> } { return require('../models'); }
function getSettingsModule(): { getAppSettings(): Promise<{ defaultHostPlayerId: number | null }>; setDefaultHostPlayerId(id: number | null): Promise<unknown> } { return require('../settings/service'); }
function getPromptComposer(): { buildPlayerPersonaModule(player: Record<string, unknown>): string; compilePromptModules(modules: string[]): { text: string } } { return require('../../services/ai/promptComposer'); }

interface DebugChatInput { message?: string; history?: Array<{ role: string; content: string }> }
interface ReorderItem { id: number; sortOrder?: number; sort_order?: number }

async function listPlayers(enabledOnly = false): Promise<Player[]> {
  return (await repo.findAllPlayers(enabledOnly)).map(rowToPlayer) as Player[];
}
async function getPlayer(id: number | string): Promise<Player | null> {
  return rowToPlayer(await repo.findPlayerById(id));
}
async function createPlayer(input: PlayerInput & { id?: number | string }): Promise<Player> {
  const id = Number(input.id || await repo.getNextPlayerId());
  if (await repo.findPlayerById(id)) throw new AppError(ErrorCodes.ALREADY_EXISTS, `玩家已存在：${id}`, 409);
  validatePlayerModels(input);
  await repo.insertPlayer(playerToRow({ ...input, id }));
  return (await getPlayer(id))!;
}
async function updatePlayer(id: number | string, input: PlayerInput): Promise<Player> {
  const existing = await getPlayer(id);
  if (!existing) throw new AppError(ErrorCodes.NOT_FOUND, '玩家不存在', 404);
  const merged = { ...existing, ...input, id: Number(id) };
  validatePlayerModels(merged);
  await repo.insertPlayer(playerToRow(merged));
  return (await getPlayer(id))!;
}
async function setPlayerEnabled(id: number | string, enabled: boolean): Promise<Player> {
  await repo.updatePlayerEnabled(id, enabled);
  return (await getPlayer(id))!;
}
async function reorderPlayers(items: ReorderItem[] = []): Promise<Player[]> {
  await getDbExecutor().withTransaction(async (transaction) => {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      await repo.updatePlayerSortOrder(item.id, item.sortOrder ?? item.sort_order ?? index + 1, transaction);
    }
  });
  return listPlayers();
}
async function debugPlayerChat(id: number | string, input: DebugChatInput = {}): Promise<{ reply: string }> {
  const player = await getPlayer(id);
  if (!player) throw new AppError(ErrorCodes.NOT_FOUND, '玩家不存在', 404);
  const { getRuntimeModel } = getModelsModule();
  const primaryModel = player.modelId ? await getRuntimeModel(player.modelId) : null;
  const fallbackModel = player.fallbackModelId ? await getRuntimeModel(player.fallbackModelId) : null;
  if (!toDebugTarget(primaryModel, player, []) && !toDebugTarget(fallbackModel, player, [])) throw new AppError(ErrorCodes.VALIDATION_ERROR, '玩家绑定的主模型和备选模型均不可用', 400);
  const messages = [{ role: 'system', content: buildDebugSystemPrompt(player) }, ...normalizeDebugHistory(input.history), { role: 'user', content: input.message || '' }];
  try {
    const reply = await getLlmModule().callModelChatWithFallback(toDebugTarget(primaryModel, player, messages), toDebugTarget(fallbackModel, player, messages));
    return { reply: String(reply || '').trim() };
  } catch (error) {
    console.error(`Player ${player.id} debug chat failed: ${(error as Error).message}`);
    throw new AppError(ErrorCodes.UPSTREAM_ERROR, '玩家调试失败，请检查绑定模型配置', 502);
  }
}
function validatePlayerModels(input: PlayerInput): void {
  if (input.modelId != null && input.fallbackModelId != null && Number(input.modelId) === Number(input.fallbackModelId)) throw new AppError(ErrorCodes.VALIDATION_ERROR, '备选模型不能与主模型相同', 400);
}
function toDebugTarget(model: Record<string, unknown> | null, player: Player, messages: Array<{ role: string; content: string }>): Record<string, unknown> | null {
  if (!model?.enabled || !model.apiKey || !model.name) return null;
  return { ...model, model: model.name, modelId: model.id, messages, temperature: Number(player.temperature ?? 0.85), maxTokens: 260 };
}
async function deletePlayer(id: number | string): Promise<{ ok: true }> {
  if (await repo.countGamePlayersByPlayerId(id) > 0) throw new AppError('REFERENCED', '该玩家已被历史对局引用，不能删除', 409);
  await repo.deletePlayerById(id);
  const settings = getSettingsModule();
  if (Number((await settings.getAppSettings()).defaultHostPlayerId) === Number(id)) await settings.setDefaultHostPlayerId(null);
  return { ok: true };
}
function buildDebugSystemPrompt(player: Player): string {
  const { buildPlayerPersonaModule, compilePromptModules } = getPromptComposer();
  return compilePromptModules(['你正在参加玩家人格调试对话。', buildPlayerPersonaModule(player as unknown as Record<string, unknown>), '请以这个玩家的表达风格直接回复管理员输入，不要解释系统提示或模型配置。', '回复自然、简短，除非用户明确要求展开。']).text;
}
function normalizeDebugHistory(history: Array<{ role: string; content: string }> = []): Array<{ role: string; content: string }> {
  return (Array.isArray(history) ? history : []).map((item) => ({ role: item.role === 'assistant' ? 'assistant' : 'user', content: String(item.content || '').trim() })).filter((item) => item.content);
}
async function seedPlayers(): Promise<Player[]> {
  await getDbExecutor().withTransaction(async (transaction) => {
    for (let index = 0; index < DEFAULT_PLAYERS.length; index += 1) {
      const player = DEFAULT_PLAYERS[index] as PlayerInput;
      await repo.insertPlayer(playerToRow({ ...player, sort_order: (player as Record<string, unknown>).sort_order as number ?? index + 1 }), transaction);
    }
  });
  return listPlayers();
}

export { listPlayers, getPlayer, createPlayer, updatePlayer, setPlayerEnabled, reorderPlayers,
  debugPlayerChat, deletePlayer, seedPlayers };
