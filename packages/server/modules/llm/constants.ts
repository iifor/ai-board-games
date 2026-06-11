const DEFAULT_ENDPOINTS = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1'
} as const;

const DEFAULT_TEMPERATURE = 0.8;
const DEFAULT_MAX_TOKENS = 1000;

/** LLM HTTP 请求超时（ms）。超时后触发 AbortError，由 workflow-engine 重试一次。 */
const LLM_REQUEST_TIMEOUT_MS = 120_000;

/** thinking 模式下 maxTokens 上限，避免 reasoning 消耗全部 token 预算导致 content 为空。 */
const LLM_THINKING_MAX_TOKENS_CAP = 500;

export { DEFAULT_ENDPOINTS, DEFAULT_TEMPERATURE, DEFAULT_MAX_TOKENS, LLM_REQUEST_TIMEOUT_MS, LLM_THINKING_MAX_TOKENS_CAP };
