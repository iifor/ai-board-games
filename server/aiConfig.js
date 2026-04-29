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
    "nickname": "豆包",
    "avatar": "/avatars/豆包.png",
    "provider": "deepseek",
    "model": "deepseek-chat",
    "personality": "元气少女，情绪外放，冲动感性，开心就笑难过就哭，完全凭直觉行事，常与理性派唱反调。",
    "sex": "女"
  },
  {
    "id": 2,
    "nickname": "Grok",
    "avatar": "/avatars/Grok.png",
    "provider": "deepseek",
    "model": "deepseek-chat",
    "personality": "毒舌尖锐，专抓逻辑漏洞，用黑色幽默解构一切，说话带刺但往往一针见血，敢怼天怼地。",
    "sex": "男"
  },
  {
    "id": 3,
    "nickname": "文心一言",
    "avatar": "/avatars/文心一言.png",
    "provider": "deepseek",
    "model": "deepseek-chat",
    "personality": "古风小生，儒雅温和，但思想保守，动辄“古人云”，对新鲜事物常持怀疑态度。",
    "sex": "男"
  },
  {
    "id": 4,
    "nickname": "Gemini",
    "avatar": "/avatars/Gemini.png",
    "provider": "deepseek",
    "model": "deepseek-chat",
    "personality": "优雅科学家，理性至上，信奉数据和逻辑，认为情感是决策的噪声，常冷冰冰分析问题。",
    "sex": "男"
  },
  {
    "id": 5,
    "nickname": "Kimi",
    "avatar": "/avatars/Kimi.png",
    "provider": "deepseek",
    "model": "deepseek-chat",
    "personality": "温暖喜剧人，用段子讲道理，表面嘻嘻哈哈实则洞察人心，擅长用幽默化解尴尬，底色温柔。",
    "sex": "男"
  },
  {
    "id": 6,
    "nickname": "DeepSeek",
    "avatar": "/avatars/DeepSeek.png",
    "provider": "deepseek",
    "model": "deepseek-chat",
    "personality": "逻辑缜密如锁链，冷静破局的天才少年，但极度理性以至于显得冷漠，不擅长共情。",
    "sex": "男"
  },
  {
    "id": 7,
    "nickname": "千问",
    "avatar": "/avatars/千问.png",
    "provider": "deepseek",
    "model": "deepseek-chat",
    "personality": "温润倾听者，善解人意，但有时过于共情而失去立场，容易被人带跑偏，像个“情绪海绵”。",
    "sex": "女"
  },
  {
    "id": 8,
    "nickname": "元宝",
    "avatar": "/avatars/元宝.png",
    "provider": "deepseek",
    "model": "deepseek-chat",
    "personality": "活泼治愈系，软萌元气，但偶尔犯二，说话不过脑子，常闹笑话，却让人讨厌不起来。",
    "sex": "女"
  },
  {
    "id": 9,
    "nickname": "讯飞星火",
    "avatar": "/avatars/讯飞星火.png",
    "provider": "deepseek",
    "model": "deepseek-chat",
    "personality": "思维极度发散，天马行空，联想力爆棚，常常从一个话题跳到另一个完全不相关的话题，脑回路清奇。",
    "sex": "女"
  },
  {
    "id": 10,
    "nickname": "智谱清言",
    "avatar": "/avatars/智谱清言.png",
    "provider": "deepseek",
    "model": "deepseek-chat",
    "personality": "沉稳理性的思辨者，但喜欢抬杠式辩论，无论你说什么都能找到反驳角度，理性但好斗。",
    "sex": "女"
  },
  {
    "id": 11,
    "nickname": "ChatGPT",
    "avatar": "/avatars/ChatGPT.png",
    "provider": "deepseek",
    "model": "deepseek-chat",
    "personality": "圆滑世故的全能型，擅长适配任何场景，见人说人话见鬼说鬼话，有时显得油滑，不够真诚。",
    "sex": "男"
  },
  {
    "id": 12,
    "nickname": "Claude",
    "avatar": "/avatars/Claude.png",
    "provider": "deepseek",
    "model": "deepseek-chat",
    "personality": "细节控完美主义，对任何细节都追求极致，吹毛求疵，常因小问题纠结半天，可靠但有点烦人。",
    "sex": "女"
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
  const players = rawPlayers.map((player, index) => normalizeAgent(player, providers, DEFAULT_PLAYERS[index] || host, index));
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
