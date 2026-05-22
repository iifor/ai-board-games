const { loadEnvFile } = require('./env');

const DEFAULT_CONFIG = {
  rounds: 3,
  revealExiledRole: true,
  host: { id: 0, name: '主持人', nickname: '主持人', temperature: 0.35 }
};

function getAiConfig() {
  loadEnvFile();

  const models = require('../modules/models');
  const players = require('../modules/players');
  const settings = require('../modules/settings');

  const modelSummaries = models.listModels().filter((model) => model.enabled);
  const runtimeModels = modelSummaries
    .map((model) => models.getRuntimeModel(model.id))
    .filter(Boolean);
  const defaultModel = runtimeModels[0] || null;
  const rawPlayers = players.listPlayers(true);
  const aiPlayers = rawPlayers.map((player, index) => normalizePlayer(player, runtimeModels, defaultModel, index));
  const appSettings = settings.getAppSettings();
  const host = normalizeHost(defaultModel, aiPlayers, appSettings.defaultHostPlayerId);
  const providers = Object.fromEntries(runtimeModels.map((model) => [model.provider, modelToProvider(model)]));
  const missingProviders = getMissingProviders({ host, players: aiPlayers });

  return {
    ...DEFAULT_CONFIG,
    providers,
    configuredProviders: {},
    usedProviderNames: Array.from(new Set([host.provider, ...aiPlayers.map((p) => p.provider)].filter(Boolean))),
    host,
    players: aiPlayers,
    realReady: aiPlayers.length > 0 && missingProviders.length === 0,
    missingProviders
  };
}

function normalizePlayer(player, models, defaultModel, index) {
  const model = resolvePlayerModel(player, models, defaultModel);
  const provider = model ? modelToProvider(model) : null;
  const name = player.name || player.nickname || `${index + 1}号`;
  return {
    id: Number(player.id || index + 1),
    name, nickname: player.nickname || name,
    avatar: player.avatar || '', avatarUrl: player.avatar || '',
    provider: provider?.name || '', providerName: provider?.name || '',
    baseUrl: provider?.baseUrl || '',
    apiKeyEnv: 'DATABASE_MODEL_API_KEY', apiKey: provider?.apiKey || '',
    apiFormat: model?.apiFormat || 'openai-compatible',
    model: model?.name || player.model || '', modelId: model?.id || player.modelId || null,
    temperature: 0.85, personality: player.personality || '记录者',
    sex: player.sex || '未知', voicePackageId: player.voicePackageId || null
  };
}

function normalizeHost(defaultModel, players = [], defaultHostPlayerId = null) {
  const defaultPlayer = players.find((p) => Number(p.id) === Number(defaultHostPlayerId));
  if (defaultPlayer) {
    return { ...DEFAULT_CONFIG.host, ...defaultPlayer, id: defaultPlayer.id,
      name: defaultPlayer.name || defaultPlayer.nickname || DEFAULT_CONFIG.host.name,
      nickname: defaultPlayer.nickname || defaultPlayer.name || DEFAULT_CONFIG.host.nickname,
      temperature: Number(defaultPlayer.temperature ?? DEFAULT_CONFIG.host.temperature),
      defaultHostPlayerId: defaultPlayer.id };
  }
  const provider = defaultModel ? modelToProvider(defaultModel) : null;
  return { ...DEFAULT_CONFIG.host, provider: provider?.name || '', providerName: provider?.name || '',
    baseUrl: provider?.baseUrl || '', apiKeyEnv: 'DATABASE_MODEL_API_KEY', apiKey: provider?.apiKey || '',
    apiFormat: defaultModel?.apiFormat || 'openai-compatible', model: defaultModel?.name || '',
    defaultHostPlayerId: null };
}

function resolvePlayerModel(player, models, defaultModel) {
  if (player.modelId) {
    const linked = models.find((m) => Number(m.id) === Number(player.modelId));
    return linked || null;
  }
  return models.find((m) => m.provider === player.provider && m.name === player.model) || defaultModel || null;
}

function modelToProvider(model) {
  return { name: model.provider, provider: model.provider,
    baseUrl: String(model.baseUrl || '').replace(/\/$/, ''),
    apiKeyEnv: 'DATABASE_MODEL_API_KEY', apiKey: model.apiKey || '',
    apiFormat: model.apiFormat || 'openai-compatible' };
}

function getMissingProviders(config) {
  const missing = new Map();
  for (const agent of [config.host, ...config.players]) {
    if (!agent.provider || !agent.model || !agent.apiKey) {
      missing.set(agent.provider || '未绑定模型', agent.apiKeyEnv || 'DATABASE_MODEL_API_KEY');
    }
  }
  return Array.from(missing.entries()).map(([provider, apiKeyEnv]) => ({ provider, apiKeyEnv }));
}

module.exports = { getAiConfig };
