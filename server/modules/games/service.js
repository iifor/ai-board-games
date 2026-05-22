const repo = require('./repository');
const { rowToGame, rowToGameSummary, parseJson, toJson, normalizeGameType, getGameTypeName } = require('./utils');
const { AppError, ErrorCodes } = require('../../utils/errors');
const upload = require('../upload');

function saveGameRecord(game) {
  const row = {
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

  repo.deleteGamePlayers(row.id);
  if (Array.isArray(game.players)) {
    game.players.forEach((p) => {
      repo.insertGamePlayer(row.id, p.id || p.playerId, toJson(p));
    });
  }
  repo.insertOrReplaceGame(row);
  return listGames();
}

function listGames(filters = {}) {
  let rows = repo.findAllGames(filters);
  if (filters.playerId) {
    const gameIds = new Set(
      repo.findGamePlayersByPlayerId(filters.playerId).map(r => r.game_id)
    );
    rows = rows.filter(r => gameIds.has(r.id));
  }
  return rows.map(rowToGameSummary);
}

function getGame(id) {
  return rowToGame(repo.findGameById(id));
}

function deleteGame(id) {
  const game = getGame(id);
  if (!game) throw new AppError(ErrorCodes.NOT_FOUND, '游戏记录不存在', 404);

  upload.deleteGameAudioDirectory(game.id);

  if (Array.isArray(game.audioResources)) {
    game.audioResources.forEach((url) => {
      if (typeof url === 'string' && shouldCleanAudioUrl(url, id)) {
        upload.deleteGeneratedAudioByUrl(url);
      }
    });
  }
  repo.deleteGameById(id);
  return { ok: true };
}

function shouldCleanAudioUrl(url, excludeGameId) {
  const otherGames = repo.findAudioResourcesExceptGame(excludeGameId || '');
  const otherUrls = new Set();
  otherGames.forEach((json) => {
    const resources = parseJson(json, []);
    resources.forEach((u) => otherUrls.add(u));
  });
  return !otherUrls.has(url);
}

function getAdminStats() {
  const typeCounts = repo.countGamesByType();
  return {
    totalGames: repo.countAllGames(),
    typeCounts
  };
}

module.exports = { saveGameRecord, listGames, getGame, deleteGame, getAdminStats };
