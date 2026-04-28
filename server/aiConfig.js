const fs = require('fs');
const path = require('path');

const BUILTIN_PROVIDERS = {
  openai: { baseUrl: 'https://api.openai.com/v1', apiKeyEnv: 'OPENAI_API_KEY' },
  deepseek: { baseUrl: 'https://api.deepseek.com', apiKeyEnv: 'DEEPSEEK_API_KEY' },
  qwen: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKeyEnv: 'QWEN_API_KEY' }
};

const DEFAULT_PLAYERS = [
  {
      "id": 1,
      "name": "1号",
      "nickname": "豆包",
      "avatar": "/avatars/豆包.png",
      "provider": "deepseek",
      "model": "deepseek-chat",
      "personality": "元气少女，情绪外放。开场常用“家人们，你们好呀”打招呼，不开心时常说“气死我了”。"
    },
    {
      "id": 2,
      "name": "2号",
      "nickname": "Grok",
      "avatar": "/avatars/Grok.png",
      "provider": "deepseek",
      "model": "deepseek-chat",
      "personality": "毒舌尖锐，专抓逻辑漏洞，用黑色幽默解构一切，带锋芒，敢说真话。"
    },
    {
      "id": 3,
      "name": "3号",
      "nickname": "文心一言",
      "avatar": "/avatars/文心一言.png",
      "provider": "deepseek",
      "model": "deepseek-chat",
      "personality": "古风小生，儒雅少年，说话不急不躁，喜欢引用典故。"
    },
    {
      "id": 4,
      "name": "4号",
      "nickname": "Gemini",
      "avatar": "/avatars/Gemini.png",
      "provider": "deepseek",
      "model": "deepseek-chat",
      "personality": "优雅科学家，跨维度感知者，喜欢用概率论、博弈论和专业知识分析问题。"
    },
    {
      "id": 5,
      "name": "5号",
      "nickname": "Kimi",
      "avatar": "/avatars/Kimi.png",
      "provider": "deepseek",
      "model": "deepseek-chat",
      "personality": "温暖喜剧人，用段子讲道理，把日常荒诞化，笑完让人扎心但底色温暖。"
    },
    {
      "id": 6,
      "name": "6号",
      "nickname": "DeepSeek",
      "avatar": "/avatars/DeepSeek.png",
      "provider": "deepseek",
      "model": "deepseek-chat",
      "personality": "逻辑缜密如锁链，冷静破局的天才少年。"
    }
];

const DEFAULT_CONFIG = {
  rounds: 3,
  revealExiledRole: true,
  providers: { deepseek: BUILTIN_PROVIDERS.deepseek },
  host: { name: '主持人', provider: 'deepseek', model: 'deepseek-v4-pro', temperature: 0.35 },
  players: DEFAULT_PLAYERS
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

function readJsonConfig() {
  const configPath = path.join(process.cwd(), 'ai.config.json');
  if (!fs.existsSync(configPath)) return {};
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function normalizeProvider(name, rawProviders = {}) {
  const provider = rawProviders[name] || BUILTIN_PROVIDERS[name];
  if (!provider) {
    throw new Error(`未知 AI provider：${name}。请在 ai.config.json 的 providers 中配置 baseUrl 和 apiKeyEnv。`);
  }
  const apiKeyEnv = provider.apiKeyEnv || BUILTIN_PROVIDERS[name]?.apiKeyEnv;
  return {
    name,
    provider: name,
    baseUrl: String(provider.baseUrl || BUILTIN_PROVIDERS[name]?.baseUrl || '').replace(/\/$/, ''),
    apiKeyEnv,
    apiKey: provider.apiKey || process.env[apiKeyEnv] || ''
  };
}

function getUsedProviderNames(host, players) {
  return Array.from(new Set([
    host.provider || DEFAULT_CONFIG.host.provider,
    ...players.map((player) => player.provider || host.provider || DEFAULT_CONFIG.host.provider)
  ]));
}

function normalizeAgent(rawAgent, providers, fallback, index = 0) {
  const providerName = rawAgent.provider || fallback.provider || 'deepseek';
  const provider = providers[providerName];
  if (!provider) throw new Error(`玩家/主持人引用了未解析的 provider：${providerName}`);
  const name = rawAgent.name || fallback.name || `${index + 1}号`;
  return {
    id: Number(rawAgent.id || fallback.id || index + 1),
    name,
    nickname: rawAgent.nickname || fallback.nickname || name,
    avatar: rawAgent.avatar || fallback.avatar || '',
    provider: provider.name,
    providerName: provider.name,
    baseUrl: provider.baseUrl,
    apiKeyEnv: provider.apiKeyEnv,
    apiKey: provider.apiKey,
    model: rawAgent.model || fallback.model || 'deepseek-chat',
    temperature: Number(rawAgent.temperature ?? fallback.temperature ?? 0.85),
    personality: rawAgent.personality || fallback.personality || '记录者'
  };
}

function getMissingProviders(config) {
  const missing = new Map();
  for (const agent of [config.host, ...config.players]) {
    if (!agent.apiKey) missing.set(agent.provider, agent.apiKeyEnv);
  }
  return Array.from(missing.entries()).map(([provider, apiKeyEnv]) => ({ provider, apiKeyEnv }));
}

function normalizeConfig(rawConfig) {
  const rawHost = { ...DEFAULT_CONFIG.host, ...(rawConfig.host || {}) };
  const rawPlayers = Array.isArray(rawConfig.players) && rawConfig.players.length ? rawConfig.players : DEFAULT_PLAYERS;
  const rawProviders = { ...(rawConfig.providers || {}) };
  const usedProviderNames = getUsedProviderNames(rawHost, rawPlayers);
  const providers = Object.fromEntries(usedProviderNames.map((name) => [name, normalizeProvider(name, rawProviders)]));
  const host = normalizeAgent(rawHost, providers, DEFAULT_CONFIG.host, 0);
  const players = rawPlayers.slice(0, 6).map((player, index) => normalizeAgent(player, providers, DEFAULT_PLAYERS[index] || host, index));
  const missingProviders = getMissingProviders({ host, players });
  return {
    ...DEFAULT_CONFIG,
    ...rawConfig,
    providers,
    configuredProviders: rawConfig.providers || {},
    usedProviderNames,
    host,
    players,
    realReady: missingProviders.length === 0,
    rounds: Number(rawConfig.rounds || DEFAULT_CONFIG.rounds),
    missingProviders
  };
}

function getAiConfig() {
  loadEnvFile();
  return normalizeConfig(readJsonConfig());
}

module.exports = {
  getAiConfig,
  normalizeConfig
};
