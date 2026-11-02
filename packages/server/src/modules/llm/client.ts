import { isQuotaExhausted } from './quota';
import { LlmError, type LlmClient, type LlmRequest, type LlmResponse } from './types';

interface ChatCompletionPayload {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

function endpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

/** OpenAI 兼容的 Chat Completions 客户端，要求模型返回 JSON 对象 */
export function createOpenAiCompatibleClient(): LlmClient {
  return {
    async complete(request: LlmRequest): Promise<LlmResponse> {
      let response: Response;
      try {
        response = await fetch(endpoint(request.baseUrl), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${request.apiKey}` },
          body: JSON.stringify({
            model: request.model,
            messages: request.messages,
            temperature: request.temperature,
            max_tokens: request.maxTokens,
            response_format: { type: 'json_object' },
          }),
          signal: AbortSignal.timeout(request.timeoutMs),
        });
      } catch (error) {
        const timeout = error instanceof Error && error.name === 'TimeoutError';
        throw new LlmError(timeout ? `模型调用超时（${request.timeoutMs}ms）` : `模型调用失败：${(error as Error).message}`, true);
      }
      const payload = (await response.json().catch(() => null)) as ChatCompletionPayload | null;
      if (!response.ok) {
        const message = `模型返回 ${response.status}：${payload?.error?.message ?? response.statusText}`;
        if (isQuotaExhausted(response.status, payload)) throw new LlmError(message, false, true);
        throw new LlmError(message, response.status === 429 || response.status >= 500);
      }
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new LlmError('模型返回了空内容', true);
      const usage = payload?.usage
        ? { promptTokens: payload.usage.prompt_tokens ?? 0, completionTokens: payload.usage.completion_tokens ?? 0 }
        : null;
      return { content, usage };
    },
  };
}
