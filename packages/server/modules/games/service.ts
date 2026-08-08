import { getDbExecutor } from '../../db';
import type { DbExecutor } from '../../db/types';
import * as repo from './repository';
import { rowToGame, rowToGameSummary, parseJson, toJson } from './utils';
import { AppError, ErrorCodes } from '../../utils/errors';
import type { Game, GameSummary } from '../../types/api';
import type { GameRow } from '../../types/database';
import type { GameListFilters } from './repository';
import * as upload from '../upload';
import { recordCompletedGameMemories } from '../player-memory';
import { deletePlaybackEvents, replacePlaybackEvents } from '../game-socket/playbackRepository';
import type { PlaybackEvent } from '@ai-presenter/shared/types/playbackTypes';

interface SaveGameInput {
  id: string;
  gameType?: string;
  type?: string;
  mode?: string;
  skinId?: string | null;
  skinName?: string;
  winner?: string | null;
  winReason?: string;
  topic?: Record<string, unknown>;
  players?: { id?: number; playerId?: number; sourcePlayerId?: number; [key: string]: unknown }[];
  rounds?: unknown[];
  event?: Record<string, unknown>;
  clientViewMode?: unknown;
  audienceSession?: unknown;
  fallbackAudit?: unknown[];
  audioResources?: unknown[];
  playbackEvents?: PlaybackEvent[];
  createdAt?: string;
}

interface AdminStats {
  totalGames: number;
  typeCounts: { gameType: string; count: number }[];
}

interface GameDeletionPlan {
  gameId: string;
  generatedAudioUrls: string[];
}

async function saveGameRecord(game: SaveGameInput): Promise<GameSummary[]> {
  const row: GameRow = {
    id: game.id,
    game_type: game.gameType || game.type || 'werewolf',
    mode: game.mode || '',
    skin_id: game.skinId || null,
    skin_name: game.skinName || '',
    winner: game.winner || null,
    win_reason: game.winReason || '',
    topic_json: toJson(game.topic || {}),
    players_json: toJson(game.players || []),
    rounds_json: toJson(game.rounds || []),
    event_json: toJson({
      ...(game.event || {}),
      ...(game.clientViewMode ? { clientViewMode: game.clientViewMode } : {}),
      ...(game.audienceSession ? { audienceSession: game.audienceSession } : {}),
      ...(Array.isArray(game.fallbackAudit) ? { fallbackAudit: game.fallbackAudit } : {})
    }),
    audio_resources_json: toJson(game.audioResources || []),
    created_at: game.createdAt || new Date().toISOString()
  };

  await getDbExecutor().withTransaction(async (transaction) => {
    await repo.insertOrReplaceGame(row, transaction);
    await repo.deleteGamePlayers(row.id, transaction);
    if (Array.isArray(game.players)) {
      for (const player of game.players) {
        await repo.insertGamePlayer(row.id, player.sourcePlayerId || player.playerId || player.id || 0, toJson(player), transaction);
      }
    }
    await replacePlaybackEvents(row.id, game.playbackEvents || [], transaction);
  });

  // 异步生成记忆（LLM 调用），不阻塞对局保存
  recordCompletedGameMemories(game).catch((error: unknown) => {
    console.error('[saveGameRecord] 生成玩家记忆失败:', (error as Error).message);
  });

  return listGames();
}

async function listGames(filters: GameListFilters = {}): Promise<GameSummary[]> {
  const rows = await repo.findAllGames(filters);
  return rows.map(rowToGameSummary).filter((g): g is GameSummary => g !== null);
}

async function getGame(id: string): Promise<Game | null> {
  return rowToGame(await repo.findGameById(id));
}

async function deleteGame(id: string): Promise<{ ok: boolean }> {
  const plan = await prepareGameDeletion(id);
  if (!plan) throw new AppError(ErrorCodes.NOT_FOUND, '游戏记录不存在', 404);

  await getDbExecutor().withTransaction((transaction) => deleteGameRecords(id, transaction));
  cleanupGameFiles(plan);
  return { ok: true };
}

async function prepareGameDeletion(id: string): Promise<GameDeletionPlan | null> {
  const game = await getGame(id);
  if (!game) return null;
  const generatedAudioUrls: string[] = [];
  for (const url of Array.isArray(game.audioResources) ? game.audioResources : []) {
    if (typeof url === 'string' && await shouldCleanAudioUrl(url, id)) generatedAudioUrls.push(url);
  }
  return {
    gameId: game.id,
    generatedAudioUrls,
  };
}

async function deleteGameRecords(id: string, transaction: DbExecutor = getDbExecutor()): Promise<boolean> {
  if (!await repo.findGameById(id, transaction)) return false;
  await deletePlaybackEvents(id, transaction);
  await repo.deleteGameById(id, transaction);
  return true;
}

function cleanupGameFiles(plan: GameDeletionPlan): void {
  try {
    upload.deleteGameAudioDirectory(plan.gameId);
  } catch (error) {
    console.error(`[deleteGame] audio directory cleanup failed for ${plan.gameId}:`, (error as Error).message);
  }
  plan.generatedAudioUrls.forEach((url) => {
    try {
      upload.deleteGeneratedAudioByUrl(url);
    } catch (error) {
      console.error(`[deleteGame] audio cleanup failed for ${url}:`, (error as Error).message);
    }
  });
}

async function shouldCleanAudioUrl(url: string, excludeGameId: string): Promise<boolean> {
  const otherGames = await repo.findAudioResourcesExceptGame(excludeGameId || '');
  const otherUrls = new Set<string>();
  otherGames.forEach((json) => {
    const resources = parseJson<string[]>(json, []);
    resources.forEach((u) => otherUrls.add(u));
  });
  return !otherUrls.has(url);
}

async function getAdminStats(): Promise<AdminStats> {
  const typeCounts = await repo.countGamesByType();
  return {
    totalGames: await repo.countAllGames(),
    typeCounts
  };
}

export {
  saveGameRecord,
  listGames,
  getGame,
  deleteGame,
  prepareGameDeletion,
  deleteGameRecords,
  cleanupGameFiles,
  getAdminStats,
};
export type { SaveGameInput, AdminStats, GameDeletionPlan };
