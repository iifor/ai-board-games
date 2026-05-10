const express = require('express');
const { getAiConfig } = require('../aiConfig');
const { createAiGame } = require('../aiGameRunner');
const { getDb } = require('../db');
const { saveGameLog } = require('../gameLogStore');
const { testOpenAIConnection } = require('../openaiChat');
const { listSkins, saveGameRecord } = require('../adminStore');

const router = express.Router();

router.get('/health', (request, response) => {
  const config = getAiConfig();
  const skins = listSkins({ enabledOnly: true });
  response.json({
    ok: true,
    service: 'consensus-mist-api',
    modeControl: 'frontend-query',
    realReady: config.realReady,
    missingProviders: config.missingProviders,
    usedProviders: config.usedProviderNames,
    configuredProviders: Object.keys(config.configuredProviders || {}),
    skins: {
      count: skins.length,
      names: skins.map((skin) => skin.name)
    },
    host: {
      provider: config.host.provider,
      model: config.host.model,
      baseUrl: config.host.baseUrl,
      apiKeyEnv: config.host.apiKeyEnv,
      hasApiKey: Boolean(config.host.apiKey)
    },
    players: config.players.map((player) => ({
      id: player.id,
      nickname: player.nickname,
      provider: player.provider,
      model: player.model,
      baseUrl: player.baseUrl,
      apiKeyEnv: player.apiKeyEnv,
      hasApiKey: Boolean(player.apiKey),
      sex: player.sex,
      personality: player.personality
    }))
  });
});

router.get('/player-selections', (request, response, next) => {
  try {
    response.json({ selections: getPlayerSelections() });
  } catch (error) {
    next(error);
  }
});

router.put('/player-selections/:gameType', express.json(), (request, response, next) => {
  try {
    const gameType = normalizeGameType(request.params.gameType);
    const playerIds = normalizePlayerIds(request.body?.playerIds);
    validatePlayerSelection(gameType, playerIds);
    getDb().prepare(`
      INSERT INTO game_player_selections (game_type, player_ids_json, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(game_type) DO UPDATE SET
        player_ids_json = excluded.player_ids_json,
        updated_at = CURRENT_TIMESTAMP
    `).run(gameType, JSON.stringify(playerIds));
    response.json({ gameType, playerIds });
  } catch (error) {
    next(error);
  }
});

router.get('/diagnostics/openai', async (request, response, next) => {
  try {
    const config = getAiConfig();
    const providerName = request.query.provider;
    const targets = providerName
      ? [resolveDiagnosticProvider(config, providerName)]
      : Object.values(config.providers);
    const results = await Promise.all(targets.map((provider) => testOpenAIConnection(provider)));
    const ok = results.every((result) => result.ok);
    response.status(ok ? 200 : 502).json(providerName ? results[0] : { ok, results });
  } catch (error) {
    next(error);
  }
});

router.post('/games', async (request, response, next) => {
  try {
    const config = getRequestConfig(request);
    const game = await createGameForMode(config);
    response.status(201).json(game);
  } catch (error) {
    next(error);
  }
});

router.get('/games/new', async (request, response, next) => {
  try {
    const config = getRequestConfig(request);
    const game = await createGameForMode(config);
    response.json(game);
  } catch (error) {
    next(error);
  }
});

async function createGameForMode(config) {
  const game = await createAiGame(config);
  saveGameRecord(game);
  if (config.mode === 'real') saveGameLog(game);
  return game;
}

function resolveDiagnosticProvider(config, providerName) {
  if (config.providers[providerName]) return config.providers[providerName];
  const configured = config.configuredProviders?.[providerName];
  if (configured) {
    const apiKeyEnv = configured.apiKeyEnv;
    return {
      name: providerName,
      provider: providerName,
      baseUrl: String(configured.baseUrl || '').replace(/\/$/, ''),
      apiKeyEnv,
      apiKey: configured.apiKey || process.env[apiKeyEnv] || ''
    };
  }
  throw new Error(`未知 provider：${providerName}`);
}

function getRequestConfig(request) {
  const config = getAiConfig();
  const requestedMode = request.query.mode || request.body?.mode || 'real';
  if (requestedMode === 'mock') return { ...config, mode: 'mock' };
  if (requestedMode === 'real') {
    if (config.missingProviders.length) {
      const missing = config.missingProviders.map((item) => `${item.provider}(${item.apiKeyEnv})`).join('、');
      throw new Error(`真实模式缺少 API Key：${missing}。请在 .env 中配置，或在页面右上角切换到 Mock。`);
    }
    return { ...config, mode: 'real' };
  }
  throw new Error(`未知游戏模式：${requestedMode}`);
}

function getPlayerSelections() {
  const rows = getDb().prepare('SELECT game_type AS gameType, player_ids_json AS playerIdsJson FROM game_player_selections').all();
  return rows.reduce((result, row) => {
    result[row.gameType] = safeParseJson(row.playerIdsJson, []);
    return result;
  }, {});
}

function normalizeGameType(value) {
  if (['consensus', 'debate', 'werewolf'].includes(value)) return value;
  throw new Error(`未知游戏类型：${value}`);
}

function normalizePlayerIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter(Boolean))];
}

function validatePlayerSelection(gameType, playerIds) {
  if (gameType === 'debate') {
    if (playerIds.length < 8 || playerIds.length > 12) throw new Error('AI 辩论赛需要选择 8-12 位 AI 玩家。');
    return;
  }
  const expected = gameType === 'werewolf' ? 12 : 7;
  if (playerIds.length !== expected) throw new Error(`${gameType === 'werewolf' ? 'AI 狼人杀' : '共识迷雾'}需要选择恰好 ${expected} 位 AI 玩家。`);
}

function safeParseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

module.exports = router;
