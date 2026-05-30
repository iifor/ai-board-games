const DEFAULT_ENDPOINTS = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1'
} as const;

const DEFAULT_TEMPERATURE = 0.8;
const DEFAULT_MAX_TOKENS = 1000;

export { DEFAULT_ENDPOINTS, DEFAULT_TEMPERATURE, DEFAULT_MAX_TOKENS };
