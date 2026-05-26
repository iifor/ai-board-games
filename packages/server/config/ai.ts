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
  defaultHostPlayerId?: number | null;
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
  hostModelId?: number | null;
  defaultHostModelId?: number | null;
}

type HostModelSource = Pick<AgentConfig, 'provider' | 'providerName' | 'baseUrl' | 'apiKeyEnv' | 'apiKey' | 'apiFormat' | 'model' | 'modelId' | 'temperature' | 'thinkingEnabled'>;

function getAiConfig(): AiConfig {
  loadEnvFile();

  const models = require('../modules/models');
  const players = require('../modules/players');
  const settings = require('../modules/settings');

  const modelSummaries = models.listModels().filter((model: Record<string, unknown>) => model.enabled);
  const runtimeModels = modelSummaries
    .map((model: Record<string, unknown>) => models.getRuntimeModel(model.id))
    .filter(Boolean);
  const defaultModel = runtimeModels[0] || null;
  const rawPlayers = players.listPlayers(true);
  const aiPlayers = rawPlayers.map((player: Record<string, unknown>, index: number) => normalizePlayer(player, runtimeModels, defaultModel, index));
  const appSettings = settings.getAppSettings() as AppSettings;
  const host = normalizeHost({
    players: aiPlayers,
    defaultHostPlayerId: appSettings.defaultHostPlayerId,
    configuredModel: resolveConfiguredHostModel(
      runtimeModels,
      appSettings.hostModelId ?? appSettings.defaultHostModelId ?? null,
    )
  });
  const providers = Object.fromEntries(runtimeModels.map((model: Record<string, unknown>) => [model.provider, modelToProvider(model)]));
  const missingProviders = getMissingProviders({ host, players: aiPlayers });

  return {
    ...DEFAULT_CONFIG,
    providers,
    configuredProviders: {},
    usedProviderNames: Array.from(new Set([host.provider, ...aiPlayers.map((p: AgentConfig) => p.provider)].filter(Boolean))),
    host,
    players: aiPlayers,
    realReady: aiPlayers.length > 0 && missingProviders.length === 0,
    missingProviders
  };
}

function normalizePlayer(player: Record<string, unknown>, models: Record<string, unknown>[], defaultModel: Record<string, unknown> | null, index: number): AgentConfig {
  const model = resolvePlayerModel(player, models, defaultModel);
  const provider = model ? modelToProvider(model) : null;
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
    thinkingEnabled: (model?.thinkingEnabled as boolean) || false
  };
}

function normalizeHost(input: {
  players?: AgentConfig[];
  defaultHostPlayerId?: number | null;
  configuredModel?: Record<string, unknown> | null;
}): AgentConfig {
  const players = input.players || [];
  const defaultPlayer = players.find((p) => Number(p.id) === Number(input.defaultHostPlayerId));
  if (defaultPlayer) {
    return { ...DEFAULT_CONFIG.host, ...defaultPlayer, id: defaultPlayer.id,
      name: defaultPlayer.name || defaultPlayer.nickname || DEFAULT_CONFIG.host.name,
      nickname: defaultPlayer.nickname || defaultPlayer.name || DEFAULT_CONFIG.host.nickname,
      temperature: Number(defaultPlayer.temperature ?? DEFAULT_CONFIG.host.temperature),
      thinkingEnabled: defaultPlayer.thinkingEnabled || false,
      defaultHostPlayerId: defaultPlayer.id };
  }
  const modelSource = input.configuredModel
    ? hostModelSourceFromRuntimeModel(input.configuredModel)
    : hostModelSourceFromPlayer(players[0]);
  return { ...DEFAULT_CONFIG.host, ...modelSource,
    defaultHostPlayerId: null } as AgentConfig;
}

function resolveConfiguredHostModel(models: Record<string, unknown>[], hostModelId?: number | null): Record<string, unknown> | null {
  if (hostModelId) {
    return models.find((model) => Number(model.id) === Number(hostModelId)) || null;
  }
  return null;
}

function hostModelSourceFromRuntimeModel(model: Record<string, unknown>): HostModelSource {
  const provider = modelToProvider(model);
  return {
    provider: provider.name || '',
    providerName: provider.name || '',
    baseUrl: provider.baseUrl || '',
    apiKeyEnv: 'DATABASE_MODEL_API_KEY',
    apiKey: provider.apiKey || '',
    apiFormat: (model.apiFormat as string) || 'openai-compatible',
    model: (model.name as string) || '',
    modelId: (model.id as number) || null,
    temperature: DEFAULT_CONFIG.host.temperature,
    thinkingEnabled: (model.thinkingEnabled as boolean) || false
  };
}

function hostModelSourceFromPlayer(player?: AgentConfig): Partial<HostModelSource> {
  if (!player) return {};
  return {
    provider: player.provider,
    providerName: player.providerName,
    baseUrl: player.baseUrl,
    apiKeyEnv: player.apiKeyEnv,
    apiKey: player.apiKey,
    apiFormat: player.apiFormat,
    model: player.model,
    modelId: player.modelId,
    temperature: Number(player.temperature ?? DEFAULT_CONFIG.host.temperature),
    thinkingEnabled: player.thinkingEnabled || false
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

function getMissingProviders(config: { host: AgentConfig; players: AgentConfig[] }): Array<{ provider: string; apiKeyEnv: string }> {
  const missing = new Map<string, string>();
  for (const agent of [config.host, ...config.players]) {
    if (!agent.provider || !agent.model || !agent.apiKey) {
      missing.set(agent.provider || '未绑定模型', agent.apiKeyEnv || 'DATABASE_MODEL_API_KEY');
    }
  }
  return Array.from(missing.entries()).map(([provider, apiKeyEnv]) => ({ provider, apiKeyEnv }));
}

export { getAiConfig };
export type { AiConfig, AgentConfig, ProviderInfo };
