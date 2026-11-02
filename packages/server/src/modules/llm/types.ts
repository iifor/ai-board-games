import type { ChatMessage } from '@battle/engine';

export interface LlmRequest {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  readonly temperature: number;
  readonly maxTokens: number;
  readonly timeoutMs: number;
}

export interface LlmUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
}

export interface LlmResponse {
  readonly content: string;
  readonly usage: LlmUsage | null;
}

/**
 * 传输层失败：retryable 表示超时、限流、5xx 等可以重试的错误；
 * quotaExhausted 表示供应商明确返回额度耗尽 / 欠费，模型应被停用并切换备用模型。
 */
export class LlmError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly quotaExhausted = false) {
    super(message);
    this.name = 'LlmError';
  }
}

export interface LlmClient {
  complete(request: LlmRequest): Promise<LlmResponse>;
}
