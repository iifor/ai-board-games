const { WebSocketServer } = require('ws');
const { getAiConfig } = require('../../config');
const { getDb } = require('../../db');
const { runAiDebate } = require('../../aiDebateRunner');
const { runWerewolfWorkflow } = require('../werewolf');
const { getWerewolfModeConfig } = require('../werewolf-config/service');
const { createProjectionContext, projectWerewolfGame } = require('../werewolf/views/viewPolicy');
const { getGame, saveGameRecord } = require('../games');
const { createSession, isSessionCancelled, parseMessage } = require('./session');
const { createPreparedSender } = require('./sender');
const { replayGameSession } = require('./replay');

function attachGameSocket(server) {
  const wss = new WebSocketServer({ server, path: '/api/toc/ws/game' });

  wss.on('connection', (socket) => {
    const session = createSession(socket);

    socket.on('message', async (raw) => {
      const message = parseMessage(raw);
      if (!message) return;

      if (message.type === 'start') {
        runSession(session, message.mode || 'real', message.playerIds, message.gameType, {
          topic: message.topic,
          debateTeams: message.debateTeams,
          hostId: message.hostId,
          werewolfMode: message.werewolfMode,
          replayGameId: message.replayGameId,
          clientViewMode: message.clientViewMode,
          replayView: message.replayView
        }).catch((error) => {
          if (isSessionCancelled(error)) return;
          console.error(error);
          session.send({ type: 'error', message: error.message });
        });
      }

      if (message.type === 'ack') {
        session.resolveAck(message.ackId);
      }

      if (message.type === 'control') {
        session.setPaused(message.action === 'pause');
        if (message.action === 'skip-phase') session.skipCurrentPhase();
      }
    });
  });
}

async function runSession(session, mode, playerIds, gameType = 'werewolf', options = {}) {
  const safeGameType = normalizeGameType(gameType);
  if (mode !== 'real') throw new Error('全局已禁用 Mock 模式，只支持真实模式。');
  if (options.replayGameId) {
    await replayGameSession(session, safeGameType, options.replayGameId, options);
    return;
  }
  const config = getRequestConfig(mode, playerIds, safeGameType, options);

  const sender = createPreparedSender(session, safeGameType === 'debate' ? { phaseLookahead: 1 } : { prefetchCount: 2 });

  if (safeGameType !== 'debate') {
    await sender.send({
      type: 'host',
      message: getStartMessage(safeGameType),
      game: { type: safeGameType, host: publicSocketHost(config.host) }
    });
  }

  const runner = getRunner(safeGameType);
  const game = await runner(config, {
    onEvent: (event) => sender.enqueue(event)
  });
  await sender.flush();

  saveGameRecord({ ...game, audioResources: sender.getAudioResources() });

  await sender.send({
    type: safeGameType === 'debate' || safeGameType === 'werewolf' ? 'workflow-completed' : 'done',
    message: getDoneMessage(safeGameType),
    game: safeGameType === 'werewolf' ? projectWerewolfGame(game, createProjectionContext(game)) : game
  });
  session.close();
}

function normalizeGameType(gameType) {
  if (gameType === 'debate') return 'debate';
  if (gameType === 'werewolf') return 'werewolf';
  return 'werewolf';
}

function getRunner(gameType) {
  if (gameType === 'debate') return runAiDebate;
  return runWerewolfWorkflow;
}

function getStartMessage(gameType) {
  if (gameType === 'debate') return '辩论赛开始';
  return '游戏开始';
}

function getDoneMessage(gameType) {
  if (gameType === 'debate') return '辩论赛结束，完整赛果已生成。';
  return '狼人杀结束，完整战报已生成。';
}

function getRequestConfig(mode, playerIds, gameType = 'werewolf', options = {}) {
  const config = getAiConfig();
  const selected = gameType === 'debate' && hasDebateTeamConfig(options.debateTeams)
    ? selectDebateTeamPlayers(config, options.debateTeams)
    : selectPlayersForGame(config, playerIds, gameType, options);
  const host = resolveRequestHost(config, options.hostId);
  const selectedProviders = new Set([host.provider, ...selected.map((player) => player.provider)]);
  const missingProviders = config.missingProviders.filter((item) => selectedProviders.has(item.provider));
  const scopedConfig = {
    ...config,
    host,
    players: selected,
    selectedPlayerIds: selected.map((player) => player.id),
    gameType,
    topic: options.topic || null,
    debateTeams: options.debateTeams || null,
    werewolfMode: options.werewolfMode || null,
    clientViewMode: options.clientViewMode || 'god',
    missingProviders,
    realReady: missingProviders.length === 0
  };
  if (mode !== 'real') throw new Error('全局已禁用 Mock 模式，只支持真实模式。');
  if (scopedConfig.missingProviders.length) {
    const missing = scopedConfig.missingProviders.map((item) => `${item.provider}(${item.apiKeyEnv})`).join('、');
    throw new Error(`真实模式缺少 API Key：${missing}。请在 .env 或 B 端模型管理中配置。`);
  }
  return { ...scopedConfig, mode: 'real' };
}

function resolveRequestHost(config, hostId) {
  const id = Number(hostId);
  if (!id) return config.host;
  const player = config.players.find((item) => Number(item.id) === id);
  if (!player) return config.host;
  return {
    ...config.host,
    id: player.id,
    name: player.name || player.nickname || config.host.name,
    nickname: player.nickname || player.name || config.host.nickname,
    provider: player.provider,
    providerName: player.providerName || player.provider,
    baseUrl: player.baseUrl,
    apiKeyEnv: player.apiKeyEnv,
    apiKey: player.apiKey,
    apiFormat: player.apiFormat,
    model: player.model,
    modelId: player.modelId,
    temperature: Number(player.temperature ?? config.host.temperature ?? 0.35),
    personality: player.personality || '',
    sex: player.sex || '',
    avatar: player.avatar || '',
    avatarUrl: player.avatarUrl || player.avatar || '',
    voicePackageId: player.voicePackageId || null
  };
}

function publicSocketHost(host = {}) {
  return {
    id: host.id || 0,
    name: host.name || host.nickname || '主持人',
    nickname: host.nickname || host.name || '主持人',
    avatar: host.avatar || '',
    avatarUrl: host.avatarUrl || host.avatar || '',
    voicePackageId: host.voicePackageId || null
  };
}

function hasDebateTeamConfig(value) {
  return value && Array.isArray(value.proIds) && Array.isArray(value.conIds);
}

function selectDebateTeamPlayers(config, debateTeams) {
  const ids = normalizeDebateTeamPlayerIds(debateTeams);
  const selected = ids
    .map((id) => config.players.find((player) => Number(player.id) === Number(id)))
    .filter(Boolean);
  if (selected.length < 8 || selected.length > 12) {
    throw new Error('AI 辩论赛玩家配置无效：正方、反方和评委人数不正确。');
  }
  return selected;
}

function normalizeDebateTeamPlayerIds(debateTeams) {
  const ids = [
    ...normalizeIdList(debateTeams.proIds).slice(0, 4),
    ...normalizeIdList(debateTeams.conIds).slice(0, 4),
    ...normalizeIdList(debateTeams.judgeIds)
  ];
  return [...new Set(ids)];
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(Number).filter(Boolean);
}

function selectPlayersForGame(config, playerIds, gameType, options = {}) {
  const explicitIds = Array.isArray(playerIds) ? playerIds.map(Number).filter(Boolean) : [];
  const ids = explicitIds.length ? explicitIds : getSavedPlayerIds(gameType);
  const expectedWerewolfCount = gameType === 'werewolf' ? getWerewolfModeConfig(options.werewolfMode).totalPlayers : 12;

  const selected = ids.length
    ? ids.map((id) => config.players.find((player) => Number(player.id) === id)).filter(Boolean)
    : config.players.slice(0, gameType === 'debate' ? 12 : expectedWerewolfCount);

  if (gameType === 'debate') {
    if (selected.length < 8 || selected.length > 12) {
      throw new Error('AI 辩论赛需要选择 8-12 位 AI 玩家。');
    }
    return selected;
  }

  if (gameType === 'werewolf') {
    if (selected.length !== expectedWerewolfCount) {
      throw new Error(`AI 狼人杀当前模式需要选择恰好 ${expectedWerewolfCount} 位 AI 玩家。`);
    }
    return selected;
  }

  return selected;
}

function getSavedPlayerIds(gameType) {
  try {
    const row = getDb().prepare('SELECT player_ids_json AS playerIdsJson FROM game_player_selections WHERE game_type = ?').get(gameType);
    if (!row) return [];
    const parsed = JSON.parse(row.playerIdsJson);
    return Array.isArray(parsed) ? parsed.map(Number).filter(Boolean) : [];
  } catch {
    return [];
  }
}

module.exports = {
  attachGameSocket,
  runSession,
  normalizeGameType,
  getRunner,
  getRequestConfig,
  resolveRequestHost,
  publicSocketHost,
  selectPlayersForGame,
  getSavedPlayerIds
};
