import { getFetchFailureHint, normalizeBaseUrl } from './utils';
import { extractTokenUsage } from '../observability/pricing';
import { LLM_REQUEST_TIMEOUT_MS } from './constants';

// Observability: lazy-loaded to avoid circular deps
let _obs: unknown = null;
function _getObs(): {
  startLlmSpan: (attrs: Record<string, unknown>) => {
    spanContext: () => { spanId: string };
    addEvent: (name: string, attrs?: Record<string, unknown>) => void;
    setAttributes: (attrs: Record<string, unknown>) => void;
  } | null;
  endSpan: (span: unknown, status: string, attrs?: Record<string, unknown>, error?: unknown) => void;
  getActiveTrace: (gameId: string) => unknown;
  recordLlmCall: (ctx: unknown, record: Record<string, unknown>) => void;
} | null {
  if (!_obs) {
    try { _obs = require('../observability/tracer'); } catch (_) { _obs = null; }
  }
  return _obs as ReturnType<typeof _getObs>;
}

interface LlmMessage {
  role: string;
  content: string;
}

interface LlmCallOptions {
  apiKey?: string;
  baseUrl?: string;
  provider?: string;
  model?: string;
  modelId?: number | null;
  messages?: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  apiFormat?: string;
  name?: string;
  _gameId?: string;
  _playerId?: string | number;
  _playerRole?: string;
  _playerFaction?: string;
}

interface LlmRawResult {
  content: string;
  thinking: string;
}

type CallableModel = LlmCallOptions & { apiKey: string; model: string; messages: LlmMessage[] };

const quotaDisabledModelIds = new Set<number>();
const quotaExhaustedErrorCodes = new Set([
  'arrearage',
  'allocationquota.freetieronly',
  'prepaidbilloverdue',
  'postpaidbilloverdue',
  'accountoverdue',
]);

interface TestConnectionResult {
  ok: boolean;
  latencyMs?: number;
  provider?: string;
  model?: string;
  apiFormat?: string;
  message?: string;
  status?: number;
  endpoint?: string;
  baseUrl?: string;
  apiKeyEnv?: string;
}

interface LlmRecord {
  provider: string;
  model: string;
  apiFormat: string;
  playerId?: string | number;
  playerRole?: string;
  playerFaction?: string;
  messages: LlmMessage[];
  responseText?: string;
  thinkingText?: string | null;
  temperature?: number | null;
  maxTokens?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  latencyMs: number;
  errorMessage?: string;
}

async function callOpenAIChatRawAttempt({
  apiKey,
  baseUrl = 'https://api.openai.com/v1',
  provider = 'openai',
  model,
  messages,
  temperature = 0.8,
  maxTokens = 1000,
  apiFormat = 'openai-compatible',
  modelId,
  _gameId,
  _playerId,
  _playerRole,
  _playerFaction
}: LlmCallOptions & { apiKey: string; model: string; messages: LlmMessage[] }): Promise<LlmRawResult> {
  if (apiFormat === 'anthropic-compatible') {
    return callAnthropicChatRawAttempt({ apiKey, baseUrl, provider, model, modelId, messages, temperature, maxTokens, _gameId, _playerId, _playerRole, _playerFaction });
  }

  const obs = _getObs();
  const span = obs ? obs.startLlmSpan({
    'gen_ai.provider.name': provider,
    'gen_ai.request.model': model,
    'gen_ai.request.temperature': temperature,
    'gen_ai.request.max_tokens': maxTokens,
    'game.id': _gameId ?? null,
    'player.id': _playerId != null ? String(_playerId) : null,
    'player.role': _playerRole || null,
    'player.faction': _playerFaction || null
  }) : null;
  const spanId = span ? span.spanContext().spanId : null;

  const _startedAt = Date.now();
  const endpoint = `${normalizeBaseUrl(baseUrl, 'https://api.openai.com/v1', 'Base URL').replace(/\/$/, '')}/chat/completions`;
  let response: Response;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(
    new Error(`LLM request timeout after ${LLM_REQUEST_TIMEOUT_MS}ms`)
  ), LLM_REQUEST_TIMEOUT_MS);

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens
      }),
      signal: controller.signal,
    });
  } catch (error) {
    const latencyMs = Date.now() - _startedAt;
    _recordLlmError(_gameId, spanId, { provider, model, apiFormat, playerId: _playerId, playerRole: _playerRole, playerFaction: _playerFaction, messages: messages || [], latencyMs, errorMessage: getFetchFailureHint(error, endpoint) });
    if (span) {
      span.addEvent('gen_ai.user.message', { content: JSON.stringify(messages || []) });
      obs!.endSpan(span, 'error', {}, error);
    }
    throw retryableError(`[${provider}:${model}] ${getFetchFailureHint(error, endpoint)}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const body = await response.text();
    const latencyMs = Date.now() - _startedAt;
    const errMsg = `${response.status} ${body.slice(0, 300)}`;
    _recordLlmError(_gameId, spanId, { provider, model, apiFormat, playerId: _playerId, playerRole: _playerRole, playerFaction: _playerFaction, messages: messages || [], latencyMs, errorMessage: errMsg });
    if (span) {
      span.addEvent('gen_ai.user.message', { content: JSON.stringify(messages || []) });
      obs!.endSpan(span, 'error', {}, new Error(errMsg));
    }
    const quotaExhausted = disableQuotaExhaustedModel(response.status, body, modelId, provider, model);
    const error = new Error(`[${provider}:${model}] ${response.status} ${endpoint}: ${body}`);
    if (response.status === 429) upstreamConcurrency.recordLlm429();
    if (!quotaExhausted && (response.status === 429 || response.status >= 500)) {
      (error as RetryableLlmError).retryable = true;
    }
    throw error;
  }

  const data = await response.json() as Record<string, unknown>;
  const choices = data.choices as Array<{ message?: { content?: string; reasoning_content?: string } }> | undefined;
  const message = choices?.[0]?.message || {};
  const content = String(message.content || '').trim();
  const thinking = String(message.reasoning_content || '').trim();
  const latencyMs = Date.now() - _startedAt;

  // Extract real token usage from API response
  const { promptTokens, completionTokens } = extractTokenUsage(data, apiFormat);

  // OTel span finalization
  if (span) {
    span.addEvent('gen_ai.user.message', { content: JSON.stringify(messages || []) });
    span.addEvent('gen_ai.assistant.message', { content });
    if (thinking) span.addEvent('gen_ai.assistant.thinking', { content: thinking });
    span.setAttributes({
      'gen_ai.usage.input_tokens': promptTokens ?? 0,
      'gen_ai.usage.output_tokens': completionTokens ?? 0,
      'llm.latency_ms': latencyMs
    });
    obs!.endSpan(span, 'ok');
  }

  // Layer 1: immediate LLM record write
  if (_gameId) {
    _recordLlmSuccess(_gameId, spanId, {
      provider, model, apiFormat, messages: messages || [],
      responseText: content, thinkingText: thinking || null,
      temperature, maxTokens,
      promptTokens, completionTokens,
      latencyMs,
      playerId: _playerId, playerRole: _playerRole, playerFaction: _playerFaction
    });
  }

  return { content, thinking };
}

function _recordLlmSuccess(gameId: string, spanId: string | null, record: LlmRecord): void {
  const obs = _getObs();
  if (!obs) return;
  const ctx = obs.getActiveTrace(gameId);
  if (!ctx) return;
  obs.recordLlmCall(ctx, {
    spanId,
    provider: record.provider, model: record.model,
    apiFormat: record.apiFormat,
    playerId: record.playerId ?? null,
    playerRole: record.playerRole || null,
    playerFaction: record.playerFaction || null,
    messages: record.messages,
    responseText: record.responseText,
    thinkingText: record.thinkingText,
    temperature: record.temperature, maxTokens: record.maxTokens,
    promptTokens: record.promptTokens, completionTokens: record.completionTokens,
    latencyMs: record.latencyMs,
    status: 'success'
  });
}

function _recordLlmError(gameId: string | undefined, spanId: string | null, record: LlmRecord): void {
  if (!gameId) return;
  const obs = _getObs();
  if (!obs) return;
  const ctx = obs.getActiveTrace(gameId);
  if (!ctx) return;
  obs.recordLlmCall(ctx, {
    spanId,
    provider: record.provider, model: record.model,
    apiFormat: record.apiFormat,
    playerId: record.playerId ?? null,
    playerRole: record.playerRole || null,
    playerFaction: record.playerFaction || null,
    messages: record.messages,
    responseText: '',
    thinkingText: null,
    temperature: null, maxTokens: null,
    promptTokens: null, completionTokens: null,
    latencyMs: record.latencyMs,
    status: 'error',
    errorMessage: record.errorMessage
  });
}

function _estimateTokens(messages: LlmMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    total += String(msg.content || '').length;
  }
  return Math.ceil(total / 4);
}

async function callOpenAIChat(options: LlmCallOptions & { apiKey: string; model: string; messages: LlmMessage[] }): Promise<string> {
  const { content } = await callOpenAIChatRaw(options);
  return content;
}

async function callAnthropicChatRawAttempt({
  apiKey,
  baseUrl = 'https://api.anthropic.com/v1',
  provider = 'anthropic',
  model,
  messages,
  temperature = 0.8,
  maxTokens = 1000,
  modelId,
  _gameId,
  _playerId,
  _playerRole,
  _playerFaction
}: LlmCallOptions & { apiKey: string; model: string; messages: LlmMessage[] }): Promise<LlmRawResult> {
  const obs = _getObs();
  const span = obs ? obs.startLlmSpan({
    'gen_ai.provider.name': provider,
    'gen_ai.request.model': model,
    'gen_ai.request.temperature': temperature,
    'gen_ai.request.max_tokens': maxTokens,
    'game.id': _gameId ?? null,
    'player.id': _playerId != null ? String(_playerId) : null,
    'player.role': _playerRole || null,
    'player.faction': _playerFaction || null
  }) : null;
  const spanId = span ? span.spanContext().spanId : null;

  const _startedAt = Date.now();
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl, 'https://api.anthropic.com/v1', 'Base URL').replace(/\/$/, '');
  const endpoint = `${normalizedBaseUrl.endsWith('/v1') ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`}/messages`;
  const systemMessages = (messages || []).filter((message) => message.role === 'system').map((message) => message.content).join('\n\n');
  const conversation = (messages || [])
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: String(message.content || '')
    }));
  let response: Response;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(
    new Error(`LLM request timeout after ${LLM_REQUEST_TIMEOUT_MS}ms`)
  ), LLM_REQUEST_TIMEOUT_MS);

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        system: systemMessages || undefined,
        messages: conversation.length ? conversation : [{ role: 'user', content: 'ping' }],
        temperature,
        max_tokens: maxTokens
      }),
      signal: controller.signal,
    });
  } catch (error) {
    const latencyMs = Date.now() - _startedAt;
    _recordLlmError(_gameId, spanId, { provider, model, apiFormat: 'anthropic-compatible', playerId: _playerId, playerRole: _playerRole, playerFaction: _playerFaction, messages: messages || [], latencyMs, errorMessage: getFetchFailureHint(error, endpoint) });
    if (span) {
      span.addEvent('gen_ai.user.message', { content: JSON.stringify(messages || []) });
      obs!.endSpan(span, 'error', {}, error);
    }
    throw retryableError(`[${provider}:${model}] ${getFetchFailureHint(error, endpoint)}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const body = await response.text();
    const latencyMs = Date.now() - _startedAt;
    const errMsg = `${response.status} ${body.slice(0, 300)}`;
    _recordLlmError(_gameId, spanId, { provider, model, apiFormat: 'anthropic-compatible', playerId: _playerId, playerRole: _playerRole, playerFaction: _playerFaction, messages: messages || [], latencyMs, errorMessage: errMsg });
    if (span) {
      span.addEvent('gen_ai.user.message', { content: JSON.stringify(messages || []) });
      obs!.endSpan(span, 'error', {}, new Error(errMsg));
    }
    const quotaExhausted = disableQuotaExhaustedModel(response.status, body, modelId, provider, model);
    const error = new Error(`[${provider}:${model}] ${response.status} ${endpoint}: ${body}`);
    if (response.status === 429) upstreamConcurrency.recordLlm429();
    if (!quotaExhausted && (response.status === 429 || response.status >= 500)) {
      (error as RetryableLlmError).retryable = true;
    }
    throw error;
  }

  const data = await response.json() as Record<string, unknown>;
  const contentItems = (data.content || []) as Array<{ type: string; text?: string; thinking?: string }>;
  const content = contentItems
    .filter((item) => item.type === 'text')
    .map((item) => item.text || '')
    .join('')
    .trim();
  const thinking = contentItems
    .filter((item) => item.type === 'thinking')
    .map((item) => item.thinking || '')
    .join('')
    .trim();
  const latencyMs = Date.now() - _startedAt;

  // Extract real token usage
  const { promptTokens, completionTokens } = extractTokenUsage(data, 'anthropic-compatible');

  // OTel span finalization
  if (span) {
    span.addEvent('gen_ai.user.message', { content: JSON.stringify(messages || []) });
    span.addEvent('gen_ai.assistant.message', { content });
    if (thinking) span.addEvent('gen_ai.assistant.thinking', { content: thinking });
    span.setAttributes({
      'gen_ai.usage.input_tokens': promptTokens ?? 0,
      'gen_ai.usage.output_tokens': completionTokens ?? 0,
      'llm.latency_ms': latencyMs
    });
    obs!.endSpan(span, 'ok');
  }

  // Layer 1: immediate LLM record write
  if (_gameId) {
    _recordLlmSuccess(_gameId, spanId, {
      provider, model, apiFormat: 'anthropic-compatible', messages: messages || [],
      responseText: content, thinkingText: thinking || null,
      temperature, maxTokens,
      promptTokens, completionTokens,
      latencyMs,
      playerId: _playerId, playerRole: _playerRole, playerFaction: _playerFaction
    });
  }

  return { content, thinking };
}

interface RetryableLlmError extends Error {
  retryable?: boolean;
}

function retryableError(message: string): RetryableLlmError {
  const error = new Error(message) as RetryableLlmError;
  error.retryable = true;
  return error;
}

async function withSingleTransientRetry<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (!(error as RetryableLlmError)?.retryable) throw error;
    await new Promise((resolve) => setTimeout(resolve, 300));
    return call();
  }
}

async function callOpenAIChatRaw(
  options: LlmCallOptions & { apiKey: string; model: string; messages: LlmMessage[] },
): Promise<LlmRawResult> {
  return upstreamConcurrency.llmLimiter.run(() => withSingleTransientRetry(() => callOpenAIChatRawAttempt(options)));
}

async function callAnthropicChatRaw(
  options: LlmCallOptions & { apiKey: string; model: string; messages: LlmMessage[] },
): Promise<LlmRawResult> {
  return upstreamConcurrency.llmLimiter.run(() => withSingleTransientRetry(() => callAnthropicChatRawAttempt(options)));
}

async function callAnthropicChat(options: LlmCallOptions & { apiKey: string; model: string; messages: LlmMessage[] }): Promise<string> {
  const { content } = await callAnthropicChatRaw(options);
  return content;
}

async function callModelChat(target: LlmCallOptions & { apiKey: string; model: string; messages: LlmMessage[] }): Promise<string> {
  if (target.apiFormat === 'anthropic-compatible') return callAnthropicChat(target);
  return callOpenAIChat(target);
}

async function callModelChatWithThinking(target: LlmCallOptions & { apiKey: string; model: string; messages: LlmMessage[] }): Promise<LlmRawResult> {
  if (target.apiFormat === 'anthropic-compatible') return callAnthropicChatRaw(target);
  return callOpenAIChatRaw(target);
}

async function callWithModelFallback<T>(
  primary: LlmCallOptions | null | undefined,
  fallback: LlmCallOptions | null | undefined,
  invoke: (target: CallableModel) => Promise<T>,
  isEmpty: (result: T) => boolean,
): Promise<T> {
  const primaryTarget = toCallableModel(primary);
  const fallbackTarget = toCallableModel(fallback);
  let primaryError: unknown = null;

  if (primaryTarget) {
    try {
      const result = await invoke(primaryTarget);
      if (!isEmpty(result)) return result;
      primaryError = new Error(`[${primaryTarget.provider}:${primaryTarget.model}] empty response`);
    } catch (error) {
      primaryError = error;
    }
  }

  if (fallbackTarget && !isSameModel(primaryTarget, fallbackTarget)) {
    if (primaryError) {
      console.warn(
        `[llm] ${primaryTarget?.provider || 'primary'}:${primaryTarget?.model || 'unavailable'} failed; `
        + `using ${fallbackTarget.provider}:${fallbackTarget.model}: ${errorMessage(primaryError)}`,
      );
    }
    try {
      const result = await invoke(fallbackTarget);
      if (!isEmpty(result)) return result;
      throw new Error(`[${fallbackTarget.provider}:${fallbackTarget.model}] empty response`);
    } catch (fallbackError) {
      if (primaryError) {
        throw new AggregateError([primaryError, fallbackError], 'Primary and fallback models both failed');
      }
      throw fallbackError;
    }
  }

  if (primaryError) throw primaryError;
  throw new Error('No callable primary or fallback model is configured');
}

function toCallableModel(target: LlmCallOptions | null | undefined): CallableModel | null {
  if (!target?.apiKey || !target.model) return null;
  if (target.modelId && quotaDisabledModelIds.has(Number(target.modelId))) return null;
  return { ...target, messages: target.messages || [] } as CallableModel;
}

function disableQuotaExhaustedModel(
  status: number,
  body: string,
  modelId: number | null | undefined,
  provider: string,
  model: string,
): boolean {
  if (!modelId || !isQuotaExhaustedResponse(status, body)) return false;
  quotaDisabledModelIds.add(Number(modelId));
  try {
    const models = require('../models') as {
      disableModel: (id: number, reason?: 'quota_exhausted' | null) => void;
    };
    models.disableModel(Number(modelId), 'quota_exhausted');
    console.warn(`[llm] disabled ${provider}:${model} (modelId=${modelId}) after quota exhaustion`);
  } catch (error) {
    console.error(`[llm] failed to persist quota disable for modelId=${modelId}: ${errorMessage(error)}`);
  }
  return true;
}

function isQuotaExhaustedResponse(status: number, body: string): boolean {
  if (status < 400 || status >= 500) return false;
  try {
    const payload = JSON.parse(String(body || '')) as { code?: unknown; error?: { code?: unknown } };
    const code = payload.error?.code ?? payload.code;
    return typeof code === 'string' && quotaExhaustedErrorCodes.has(code.trim().toLowerCase());
  } catch {
    return false;
  }
}

function clearQuotaDisabledModel(modelId: number): void {
  quotaDisabledModelIds.delete(Number(modelId));
}

function isSameModel(primary: CallableModel | null, fallback: CallableModel): boolean {
  if (!primary) return false;
  return primary.provider === fallback.provider
    && primary.baseUrl === fallback.baseUrl
    && primary.model === fallback.model;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function callModelChatWithFallback(
  primary: LlmCallOptions | null | undefined,
  fallback?: LlmCallOptions | null,
): Promise<string> {
  return callWithModelFallback(primary, fallback, callModelChat, (content) => !content.trim());
}

function callModelChatWithThinkingFallback(
  primary: LlmCallOptions | null | undefined,
  fallback?: LlmCallOptions | null,
): Promise<LlmRawResult> {
  return callWithModelFallback(
    primary,
    fallback,
    callModelChatWithThinking,
    (result) => !result.content.trim(),
  );
}

async function testModelConnection(target: LlmCallOptions): Promise<TestConnectionResult> {
  const startedAt = Date.now();
  if (!target?.apiKey) {
    return {
      ok: false,
      provider: target?.provider || target?.name,
      model: target?.name || target?.model,
      apiFormat: target?.apiFormat || 'openai-compatible',
      message: '缺少 API Key，请先在 B 端模型管理中配置。'
    };
  }

  try {
    const reply = await callModelChat({
      ...target,
      model: target.model || target.name!,
      messages: [{ role: 'user', content: '请只回复 pong' }],
      temperature: 0,
      maxTokens: 16
    } as LlmCallOptions & { apiKey: string; model: string; messages: LlmMessage[] });
    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      provider: target.provider,
      model: target.model || target.name,
      apiFormat: target.apiFormat || 'openai-compatible',
      message: reply || '连接成功'
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      provider: target.provider,
      model: target.model || target.name,
      apiFormat: target.apiFormat || 'openai-compatible',
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

async function testOpenAIConnection(target: LlmCallOptions & { apiKey?: string; apiKeyEnv?: string }): Promise<TestConnectionResult> {
  const endpoint = `${normalizeBaseUrl(target.baseUrl, 'https://api.openai.com/v1', 'Base URL').replace(/\/$/, '')}/models`;

  if (!target.apiKey) {
    return {
      ok: false,
      endpoint,
      provider: target.provider || target.name,
      baseUrl: target.baseUrl,
      apiKeyEnv: target.apiKeyEnv,
      message: `缺少 API Key，请在 .env 中配置 ${target.apiKeyEnv}`
    };
  }

  try {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${target.apiKey}` }
    });
    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      endpoint,
      provider: target.provider || target.name,
      baseUrl: target.baseUrl,
      apiKeyEnv: target.apiKeyEnv,
      message: response.ok ? 'OpenAI compatible endpoint reachable' : body.slice(0, 500)
    };
  } catch (error) {
    return {
      ok: false,
      endpoint,
      provider: target.provider || target.name,
      baseUrl: target.baseUrl,
      apiKeyEnv: target.apiKeyEnv,
      message: getFetchFailureHint(error, endpoint)
    };
  }
}

export {
  callAnthropicChat,
  callAnthropicChatRaw,
  callModelChat,
  callModelChatWithFallback,
  callModelChatWithThinking,
  callModelChatWithThinkingFallback,
  clearQuotaDisabledModel,
  callOpenAIChat,
  callOpenAIChatRaw,
  testModelConnection,
  testOpenAIConnection
};

export type { LlmCallOptions, LlmMessage };
import { upstreamConcurrency } from '../../utils/concurrency';
