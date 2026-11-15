import { adaptChatParameters, initialChatParameters, type ChatParameters } from './chatParameters';
import { isQuotaExhausted } from './quota';
import { LlmError, type LlmClient, type LlmRequest, type LlmResponse } from './types';

interface ChatCompletionPayload {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: string; param?: string };
}

function endpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

async function postCompletion(request: LlmRequest, parameters: ChatParameters, signal: AbortSignal): Promise<Response> {
  try {
    return await fetch(endpoint(request.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${request.apiKey}` },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        ...(parameters.sendTemperature ? { temperature: request.temperature } : {}),
        [parameters.tokenField]: request.maxTokens,
        response_format: { type: 'json_object' },
      }),
      signal,
    });
  } catch (error) {
    const timeout = error instanceof Error && error.name === 'TimeoutError';
    throw new LlmError(timeout ? `模型调用超时（${request.timeoutMs}ms）` : `模型调用失败：${(error as Error).message}`, true);
  }
}

/** OpenAI 兼容的 Chat Completions 客户端，要求模型返回 JSON 对象 */
export function createOpenAiCompatibleClient(): LlmClient {
  return {
    async complete(request: LlmRequest): Promise<LlmResponse> {
      let parameters = initialChatParameters(request.baseUrl);
      const signal = AbortSignal.timeout(request.timeoutMs);
      let payload: ChatCompletionPayload | null;
      for (;;) {
        const response = await postCompletion(request, parameters, signal);
        payload = (await response.json().catch(() => null)) as ChatCompletionPayload | null;
        if (response.ok) break;
        const message = `模型返回 ${response.status}：${payload?.error?.message ?? response.statusText}`;
        if (isQuotaExhausted(response.status, payload)) throw new LlmError(message, false, true);
        const next = response.status === 400 && adaptChatParameters(parameters, payload?.error);
        if (next) { parameters = next; continue; }
        throw new LlmError(message, response.status === 408 || response.status === 429 || response.status >= 500);
      }
      const choice = payload?.choices?.[0];
      const content = choice?.message?.content;
      if (choice?.finish_reason === 'length' && (typeof content !== 'string' || !content.trim())) {
        throw new LlmError(`模型已用完本次输出上限（${request.maxTokens} tokens），未生成可见回复`, false, false, true);
      }
      if (typeof content !== 'string' || !content.trim()) throw new LlmError('模型返回了空内容', true);
      const usage = payload?.usage
        ? { promptTokens: payload.usage.prompt_tokens ?? 0, completionTokens: payload.usage.completion_tokens ?? 0 }
        : null;
      return { content, usage, ...(choice?.finish_reason === 'length' && { truncated: true }) };
    },
  };
}
