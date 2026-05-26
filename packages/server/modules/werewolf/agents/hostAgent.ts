import { callOpenAIChat } from '../../llm';
import type { LlmCallOptions, LlmMessage } from '../../llm';
import { normalizeText } from '../playerAgent';
import { WEREWOLF } from '@ai-presenter/shared/constants/gameLimits';

interface HostConfig {
  apiKey?: string;
  baseUrl?: string;
  provider?: string;
  model?: string;
  apiFormat?: string;
  temperature?: number;
}

interface HostAgentOptions {
  onFallback?: (entry: { skillId: string; reason: string; fallbackValue: string }) => void;
  gameId?: string | null;
}

class HostAgent {
  private host: HostConfig;
  private onFallback?: (entry: { skillId: string; reason: string; fallbackValue: string }) => void;
  private gameId: string | null;

  constructor(host: HostConfig = {}, options: HostAgentOptions = {}) {
    this.host = host;
    this.onFallback = options.onFallback;
    this.gameId = options.gameId || null;
  }

  // Optional narration polish only. Workflow, action windows, effects, and win
  // checks must stay in deterministic step handlers and reducers.
  async announce(day: number, phase: string, prompt: string, fallback: string): Promise<string> {
    if (!this.host?.apiKey) return fallback;
    try {
      const reply = await callOpenAIChat({
        apiKey: this.host.apiKey,
        baseUrl: this.host.baseUrl,
        provider: this.host.provider,
        model: this.host.model,
        apiFormat: this.host.apiFormat,
        temperature: this.host.temperature,
        messages: [
          { role: 'system', content: buildHostPrompt(day, phase) },
          { role: 'user', content: prompt }
        ],
        maxTokens: Math.ceil(WEREWOLF.HOST_ANNOUNCE_CHAR_LIMIT * 2.5),
        _gameId: this.gameId
      } as LlmCallOptions & { apiKey: string; model: string; messages: LlmMessage[] });
      return normalizeText(reply as string, WEREWOLF.HOST_ANNOUNCE_CHAR_LIMIT, fallback);
    } catch (error) {
      this.onFallback?.({
        skillId: 'host-announce',
        reason: (error as Error).message || 'host-announce-failed',
        fallbackValue: fallback
      });
      return fallback;
    }
  }
}

function buildHostPrompt(day: number, phase: string): string {
  return [
    '你是《AI 狼人杀》的中文主持人。',
    '你的职责是推进阶段和播报公开信息，不得泄露夜晚私密行动结果。',
    '每次播报必须使用简体中文，简短、清晰、有桌游主持感。',
    `当前天数：${day}。当前阶段：${phase}。`
  ].join('\n');
}

export { HostAgent };
