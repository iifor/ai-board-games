import { getDb } from '../../db';
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

function saveGameRecord(game: SaveGameInput): GameSummary[] {
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

  const db = getDb();
  const tx = db.transaction(() => {
    repo.insertOrReplaceGame(row);
    repo.deleteGamePlayers(row.id);
    if (Array.isArray(game.players)) {
      game.players.forEach((p) => {
        repo.insertGamePlayer(row.id, p.sourcePlayerId || p.playerId || p.id || 0, toJson(p));
      });
    }
    replacePlaybackEvents(row.id, game.playbackEvents || []);
  });
  tx();

  // 异步生成记忆（LLM 调用），不阻塞对局保存
  recordCompletedGameMemories(game).catch((error: unknown) => {
    console.error('[saveGameRecord] 生成玩家记忆失败:', (error as Error).message);
  });

  return listGames();
}

function listGames(filters: GameListFilters = {}): GameSummary[] {
  let rows = repo.findAllGames(filters);
  if (filters.playerId) {
    const gameIds = new Set(
      repo.findGamePlayersByPlayerId(filters.playerId).map(r => r.game_id)
    );
    rows = rows.filter(r => gameIds.has(r.id));
  }
  return rows.map(rowToGameSummary).filter((g): g is GameSummary => g !== null);
}

function getGame(id: string): Game | null {
  return rowToGame(repo.findGameById(id));
}

function deleteGame(id: string): { ok: boolean } {
  const plan = prepareGameDeletion(id);
  if (!plan) throw new AppError(ErrorCodes.NOT_FOUND, '游戏记录不存在', 404);

  getDb().transaction(() => deleteGameRecords(id))();
  cleanupGameFiles(plan);
  return { ok: true };
}

function prepareGameDeletion(id: string): GameDeletionPlan | null {
  const game = getGame(id);
  if (!game) return null;
  return {
    gameId: game.id,
    generatedAudioUrls: Array.isArray(game.audioResources)
      ? game.audioResources.filter(
        (url): url is string => typeof url === 'string' && shouldCleanAudioUrl(url, id),
      )
      : [],
  };
}

function deleteGameRecords(id: string): boolean {
  if (!repo.findGameById(id)) return false;
  deletePlaybackEvents(id);
  repo.deleteGameById(id);
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

function shouldCleanAudioUrl(url: string, excludeGameId: string): boolean {
  const otherGames = repo.findAudioResourcesExceptGame(excludeGameId || '');
  const otherUrls = new Set<string>();
  otherGames.forEach((json) => {
    const resources = parseJson<string[]>(json, []);
    resources.forEach((u) => otherUrls.add(u));
  });
  return !otherUrls.has(url);
}

function getAdminStats(): AdminStats {
  const typeCounts = repo.countGamesByType();
  return {
    totalGames: repo.countAllGames(),
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
