const DEFAULT_MODELS = [
  { provider: 'deepseek', name: 'deepseek-v4-pro', baseUrl: 'https://api.deepseek.com', apiFormat: 'openai-compatible', enabled: true },
  { provider: 'openai', name: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1', apiFormat: 'openai-compatible', enabled: true },
  { provider: 'qwen', name: 'qwen-plus', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiFormat: 'openai-compatible', enabled: true }
];

module.exports = { DEFAULT_MODELS };
