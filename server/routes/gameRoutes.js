const express = require('express');
const { getAiConfig } = require('../aiConfig');
const { createAiGame } = require('../aiGameRunner');
const { getLatestGameLog, readGameLogs, saveGameLog } = require('../gameLogStore');
const { testOpenAIConnection } = require('../openaiChat');
const { initSse } = require('../utils/sse');

const router = express.Router();

router.get('/health', (request, response) => {
  const config = getAiConfig();
  response.json({
    ok: true,
    service: 'consensus-mist-api',
    modeControl: 'frontend-query',
    realReady: config.realReady,
    missingProviders: config.missingProviders,
    usedProviders: config.usedProviderNames,
    configuredProviders: Object.keys(config.configuredProviders || {}),
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
      hasApiKey: Boolean(player.apiKey)
    }))
  });
});

router.get('/history', (request, response) => {
  response.json({
    logs: readGameLogs().map((record) => ({
      filename: record.filename,
      savedAt: record.savedAt,
      game: record.game
    }))
  });
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

router.get('/games/stream', async (request, response) => {
  const stream = initSse(response);
  request.on('close', () => stream.close());

  try {
    const config = getRequestConfig(request);
    stream.send({
      type: 'host',
      message: config.mode === 'real' ? '游戏开始，AI 对局正在生成。' : 'Mock 对局开始回放。'
    });
    const game = await createAiGame(config, { onEvent: stream.send });
    if (config.mode === 'real') saveGameLog(game);
    stream.send({ type: 'done', message: '本局游戏结束，比赛结果已生成。', game });
    stream.close();
  } catch (error) {
    console.error(error);
    stream.send({ type: 'error', message: error.message });
    stream.close();
  }
});

async function createGameForMode(config) {
  if (config.mode === 'mock') {
    const latest = getLatestGameLog();
    if (latest?.game) return { ...latest.game, mode: 'mock-history', replaySource: latest.savedAt };
    return createAiGame(config);
  }

  const game = await createAiGame(config);
  saveGameLog(game);
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
      const missing = config.missingProviders.map((item) => `${item.provider}(${item.apiKeyEnv})`).join('，');
      throw new Error(`真实模式缺少 API Key：${missing}。请在 .env 中配置，或在页面右上角切换到 Mock。`);
    }
    return { ...config, mode: 'real' };
  }
  throw new Error(`未知游戏模式：${requestedMode}`);
}

module.exports = router;
