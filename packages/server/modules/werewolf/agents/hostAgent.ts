import { callOpenAIChat } from '../../llm';
import type { LlmCallOptions, LlmMessage } from '../../llm';
import { normalizeText } from '../playerAgent';
import { WEREWOLF } from '@consensus-mist/shared/constants/gameLimits';

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
    'You are the host of an AI Werewolf game.',
    'Advance phases and announcements without leaking private night information.',
    'Keep each announcement concise and clear.',
    `Current day: ${day}. Current phase: ${phase}.`
  ].join('\n');
}

export { HostAgent };
