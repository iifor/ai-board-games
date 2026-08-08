import { loadEnvFile } from './env';

const DEFAULT_CONFIG = {
  rounds: 3,
  revealExiledRole: true,
  host: { id: 0, name: '主持人', nickname: '主持人', temperature: 0.35 }
};

interface ProviderInfo {
  name: string;
  provider: string;
  baseUrl: string;
  apiKeyEnv: string;
  apiKey: string;
  apiFormat: string;
}

interface AgentConfig {
  id: number;
  name: string;
  nickname: string;
  avatar: string;
  avatarUrl: string;
  provider: string;
  providerName: string;
  baseUrl: string;
  apiKeyEnv: string;
  apiKey: string;
  apiFormat: string;
  model: string;
  modelId: number | null;
  temperature: number;
  personality: string;
  sex: string;
  voicePackageId: number | null;
  thinkingEnabled: boolean;
  fallbackModel: AgentModelConfig | null;
  defaultHostPlayerId?: number | null;
}

interface AgentModelConfig {
  apiKey: string;
  baseUrl: string;
  provider: string;
  model: string;
  modelId: number | null;
  apiFormat: string;
  thinkingEnabled: boolean;
}

interface AiConfig {
  rounds: number;
  revealExiledRole: boolean;
  providers: Record<string, ProviderInfo>;
  configuredProviders: Record<string, unknown>;
  usedProviderNames: string[];
  host: AgentConfig;
  players: AgentConfig[];
  realReady: boolean;
  missingProviders: Array<{ provider: string; apiKeyEnv: string }>;
}

interface AppSettings {
  defaultHostPlayerId: number | null;
}

async function getAiConfig(): Promise<AiConfig> {
  loadEnvFile();

  const models = require('../modules/models');
  const players = require('../modules/players');
  const settings = require('../modules/settings');

  const modelSummaries = (await models.listModels()).filter((model: Record<string, unknown>) => model?.enabled);
  const runtimeModels = (await Promise.all(
    modelSummaries.map((model: Record<string, unknown>) => models.getRuntimeModel(model.id)),
  )).filter(Boolean);
  const defaultModel = runtimeModels[0] || null;
  const rawPlayers = await players.listPlayers(true);
  const aiPlayers = rawPlayers.map((player: Record<string, unknown>, index: number) => normalizePlayer(player, runtimeModels, defaultModel, index));
  const appSettings = await settings.getAppSettings() as AppSettings;
  const host = normalizeHost({
    players: aiPlayers,
    defaultHostPlayerId: appSettings.defaultHostPlayerId
  });
  const providers = Object.fromEntries(runtimeModels.map((model: Record<string, unknown>) => [model.provider, modelToProvider(model)]));
  const missingProviders = getMissingProviders(aiPlayers);

  return {
    ...DEFAULT_CONFIG,
    providers,
    configuredProviders: {},
    usedProviderNames: Array.from(new Set(aiPlayers.flatMap((p: AgentConfig) => [p.provider, p.fallbackModel?.provider]).filter(Boolean) as string[])),
    host,
    players: aiPlayers,
    realReady: aiPlayers.length > 0 && missingProviders.length === 0,
    missingProviders
  };
}

function normalizePlayer(player: Record<string, unknown>, models: Record<string, unknown>[], defaultModel: Record<string, unknown> | null, index: number): AgentConfig {
  const model = resolvePlayerModel(player, models, defaultModel);
  const provider = model ? modelToProvider(model) : null;
  const fallbackModel = models.find((item) => Number(item.id) === Number(player.fallbackModelId)) || null;
  const name = (player.name as string) || (player.nickname as string) || `${index + 1}号`;
  return {
    id: Number(player.id || index + 1),
    name, nickname: (player.nickname as string) || name,
    avatar: (player.avatar as string) || '', avatarUrl: (player.avatar as string) || '',
    provider: provider?.name || '', providerName: provider?.name || '',
    baseUrl: provider?.baseUrl || '',
    apiKeyEnv: 'DATABASE_MODEL_API_KEY', apiKey: provider?.apiKey || '',
    apiFormat: (model?.apiFormat as string) || 'openai-compatible',
    model: (model?.name as string) || (player.model as string) || '', modelId: (model?.id as number) || (player.modelId as number) || null,
    temperature: 0.85, personality: (player.personality as string) || '记录者',
    sex: (player.sex as string) || '未知', voicePackageId: (player.voicePackageId as number) || null,
    thinkingEnabled: (model?.thinkingEnabled as boolean) || false,
    fallbackModel: toAgentModelConfig(fallbackModel)
  };
}

function normalizeHost(input: {
  players?: AgentConfig[];
  defaultHostPlayerId?: number | null;
}): AgentConfig {
  const players = input.players || [];
  const defaultPlayer = players.find((p) => Number(p.id) === Number(input.defaultHostPlayerId));
  if (defaultPlayer) {
    return { ...emptyHost(), id: defaultPlayer.id,
      name: defaultPlayer.name || defaultPlayer.nickname || DEFAULT_CONFIG.host.name,
      nickname: defaultPlayer.nickname || defaultPlayer.name || DEFAULT_CONFIG.host.nickname,
      avatar: defaultPlayer.avatar || '',
      avatarUrl: defaultPlayer.avatarUrl || defaultPlayer.avatar || '',
      voicePackageId: defaultPlayer.voicePackageId || null,
      defaultHostPlayerId: defaultPlayer.id };
  }
  return { ...emptyHost(), defaultHostPlayerId: null };
}

function emptyHost(): AgentConfig {
  return {
    id: 0,
    name: DEFAULT_CONFIG.host.name,
    nickname: DEFAULT_CONFIG.host.nickname,
    avatar: '',
    avatarUrl: '',
    provider: '',
    providerName: '',
    baseUrl: '',
    apiKeyEnv: '',
    apiKey: '',
    apiFormat: '',
    model: '',
    modelId: null,
    temperature: DEFAULT_CONFIG.host.temperature,
    personality: '',
    sex: '',
    voicePackageId: null,
    thinkingEnabled: false,
    fallbackModel: null
  };
}

function resolvePlayerModel(player: Record<string, unknown>, models: Record<string, unknown>[], defaultModel: Record<string, unknown> | null): Record<string, unknown> | null {
  if (player.modelId) {
    const linked = models.find((m) => Number(m.id) === Number(player.modelId));
    return linked || null;
  }
  return models.find((m) => m.provider === player.provider && m.name === player.model) || defaultModel || null;
}

function modelToProvider(model: Record<string, unknown>): ProviderInfo {
  const apiKeyEnv = 'DATABASE_MODEL_API_KEY';
  return { name: model.provider as string, provider: model.provider as string,
    baseUrl: String(model.baseUrl || '').replace(/\/$/, ''),
    apiKeyEnv, apiKey: (model.apiKey as string) || process.env[apiKeyEnv] || '',
    apiFormat: (model.apiFormat as string) || 'openai-compatible' };
}

function toAgentModelConfig(model: Record<string, unknown> | null): AgentModelConfig | null {
  if (!model) return null;
  const provider = modelToProvider(model);
  return {
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    provider: provider.name,
    model: String(model.name || ''),
    modelId: Number(model.id) || null,
    apiFormat: String(model.apiFormat || provider.apiFormat || 'openai-compatible'),
    thinkingEnabled: Boolean(model.thinkingEnabled),
  };
}

function getMissingProviders(players: AgentConfig[]): Array<{ provider: string; apiKeyEnv: string }> {
  const missing = new Map<string, string>();
  for (const agent of players) {
    const primaryReady = Boolean(agent.provider && agent.model && agent.apiKey);
    const fallbackReady = Boolean(agent.fallbackModel?.provider && agent.fallbackModel.model && agent.fallbackModel.apiKey);
    if (!primaryReady && !fallbackReady) {
      missing.set(agent.provider || '未绑定模型', agent.apiKeyEnv || 'DATABASE_MODEL_API_KEY');
    }
  }
  return Array.from(missing.entries()).map(([provider, apiKeyEnv]) => ({ provider, apiKeyEnv }));
}

export { getAiConfig };
export type { AiConfig, AgentConfig, ProviderInfo };
