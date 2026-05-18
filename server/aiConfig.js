const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  rounds: 3,
  revealExiledRole: true,
  host: { id: 0, name: '主持人', nickname: '主持人', temperature: 0.35 }
};

function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function getAiConfig() {
  loadEnvFile();
  const { getAppSettings, initAdminData, listPlayers, listModels, getRuntimeModel } = require('./adminStore');
  initAdminData();

  const modelSummaries = listModels().filter((model) => model.enabled);
  const runtimeModels = modelSummaries
    .map((model) => getRuntimeModel(model.id))
    .filter(Boolean);
  const defaultModel = runtimeModels[0] || null;
  const rawPlayers = listPlayers({ enabledOnly: true });
  const players = rawPlayers.map((player, index) => normalizePlayer(player, runtimeModels, defaultModel, index));
  const settings = getAppSettings();
  const host = normalizeHost(defaultModel, players, settings.defaultHostPlayerId);
  const providers = Object.fromEntries(runtimeModels.map((model) => [model.provider, modelToProvider(model)]));
  const missingProviders = getMissingProviders({ host, players });

  return {
    ...DEFAULT_CONFIG,
    providers,
    configuredProviders: {},
    usedProviderNames: Array.from(new Set([host.provider, ...players.map((player) => player.provider)].filter(Boolean))),
    host,
    players,
    realReady: players.length > 0 && missingProviders.length === 0,
    missingProviders
  };
}

function normalizePlayer(player, models, defaultModel, index) {
  const model = resolvePlayerModel(player, models, defaultModel);
  const provider = model ? modelToProvider(model) : null;
  const name = player.name || player.nickname || `${index + 1}号`;
  return {
    id: Number(player.id || index + 1),
    name,
    nickname: player.nickname || name,
    avatar: player.avatar || '',
    avatarUrl: player.avatar || '',
    provider: provider?.name || '',
    providerName: provider?.name || '',
    baseUrl: provider?.baseUrl || '',
    apiKeyEnv: 'DATABASE_MODEL_API_KEY',
    apiKey: provider?.apiKey || '',
    apiFormat: model?.apiFormat || 'openai-compatible',
    model: model?.name || player.model || '',
    modelId: model?.id || player.modelId || null,
    temperature: 0.85,
    personality: player.personality || '记录者',
    sex: player.sex || '未知',
    voicePackageId: player.voicePackageId || null
  };
}

function normalizeHost(defaultModel, players = [], defaultHostPlayerId = null) {
  const defaultPlayer = players.find((player) => Number(player.id) === Number(defaultHostPlayerId));
  if (defaultPlayer) {
    return {
      ...DEFAULT_CONFIG.host,
      ...defaultPlayer,
      id: defaultPlayer.id,
      name: defaultPlayer.name || defaultPlayer.nickname || DEFAULT_CONFIG.host.name,
      nickname: defaultPlayer.nickname || defaultPlayer.name || DEFAULT_CONFIG.host.nickname,
      temperature: Number(defaultPlayer.temperature ?? DEFAULT_CONFIG.host.temperature),
      defaultHostPlayerId: defaultPlayer.id
    };
  }
  const provider = defaultModel ? modelToProvider(defaultModel) : null;
  return {
    ...DEFAULT_CONFIG.host,
    provider: provider?.name || '',
    providerName: provider?.name || '',
    baseUrl: provider?.baseUrl || '',
    apiKeyEnv: 'DATABASE_MODEL_API_KEY',
    apiKey: provider?.apiKey || '',
    apiFormat: defaultModel?.apiFormat || 'openai-compatible',
    model: defaultModel?.name || '',
    defaultHostPlayerId: null
  };
}

function resolvePlayerModel(player, models, defaultModel) {
  if (player.modelId) {
    const linked = models.find((model) => Number(model.id) === Number(player.modelId));
    if (linked) return linked;
  }
  const legacy = models.find((model) => model.provider === player.provider && model.name === player.model);
  return legacy || defaultModel || null;
}

function modelToProvider(model) {
  return {
    name: model.provider,
    provider: model.provider,
    baseUrl: String(model.baseUrl || '').replace(/\/$/, ''),
    apiKeyEnv: 'DATABASE_MODEL_API_KEY',
    apiKey: model.apiKey || '',
    apiFormat: model.apiFormat || 'openai-compatible'
  };
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

module.exports = {
  getAiConfig,
  normalizeConfig: (value) => value
};
