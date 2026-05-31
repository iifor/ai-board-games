import { callOpenAIChat, callModelChatWithThinking, parseJsonObject } from '../llm';
import { AgentSkillRegistry, AgentSkill } from './skillRegistry';
import { FallbackEntry } from './fallbackAudit';
import { getActiveTrace, recordEvent } from '../observability';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CallResult {
  content: string;
  thinking: string;
}

interface Player {
  id: string | number;
  apiKey?: string;
  baseUrl?: string;
  provider?: string;
  model?: string;
  apiFormat?: string;
  temperature?: number;
  thinkingEnabled?: boolean;
  [key: string]: unknown;
}

interface AskTextOptions {
  limit?: number;
  maxTokens?: number;
  skillId?: string;
  phase?: string;
}

interface AskJsonOptions {
  maxTokens?: number;
  skillId?: string;
  phase?: string;
}

interface AskVoteOptions {
  skillId?: string;
  phase?: string;
}

interface PlayerAgentOptions {
  onError?: (entry: FallbackEntry) => void;
  gameId?: string;
  gameType?: string;
  resolveRole?: (item: Player) => string;
  resolveFaction?: (item: Player) => string;
}

function normalizeText(text: unknown, limit: number): string {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean;
}

class BasePlayerAgent {
  player: Player;
  messages: ChatMessage[];
  onError?: (entry: FallbackEntry) => void;
  thinkingEnabled: boolean;
  gameId: string | null;
  gameType: string;
  resolveRole: (item: Player) => string;
  resolveFaction: (item: Player) => string;
  skillRegistry: AgentSkillRegistry;

  constructor(player: Player, systemPrompt: string, options: PlayerAgentOptions = {}) {
    this.player = player;
    this.messages = [{ role: 'system', content: systemPrompt }];
    this.onError = options.onError;
    this.thinkingEnabled = Boolean(player.thinkingEnabled);
    this.gameId = options.gameId || null;
    this.gameType = options.gameType || '';
    this.resolveRole = options.resolveRole || ((item: Player) => (item.role as string) || (item.roleLabel as string) || '');
    this.resolveFaction = options.resolveFaction || ((item: Player) => (item.faction as string) || (item.side as string) || '');
    this.skillRegistry = new AgentSkillRegistry();
  }

  registerSkill(skill: AgentSkill): this {
    this.skillRegistry.register({ ...skill, scope: 'player' });
    return this;
  }

  registerSkills(skills: AgentSkill[] = []): this {
    this.skillRegistry.registerMany(skills.map((skill) => ({ ...skill, scope: 'player' })));
    return this;
  }

  hasSkill(action: string): boolean {
    return this.skillRegistry.has(action);
  }

  getSkill(action: string): AgentSkill | null {
    return this.skillRegistry.get(action);
  }

  listSkills(): AgentSkill[] {
    return this.skillRegistry.list();
  }

  executeSkill(action: string, context: Record<string, unknown> = {}): Promise<unknown> {
    return this.skillRegistry.execute(action, { ...context, actor: context.actor || this.player });
  }

  // -----------------------------------------------------------
  // AI call helpers: return null on failure, no fallback value.
  // -----------------------------------------------------------

  async askText(prompt: string, options: AskTextOptions = {}): Promise<string | null> {
    const limit = options.limit || 260;
    if (!this.player.apiKey) {
      this.recordError(options.skillId || 'player-text', 'missing-api-key', options);
      return null;
    }
    try {
      const reply = await this.call(prompt, options.maxTokens || 800);
      return normalizeText(reply, limit);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.recordError(options.skillId || 'player-text', err.message, options);
      return null;
    }
  }

  async askJson(prompt: string, options: AskJsonOptions = {}): Promise<Record<string, unknown> | null> {
    if (!this.player.apiKey) {
      this.recordError(options.skillId || 'player-json', 'missing-api-key', options);
      return null;
    }
    const jsonOnly = '\n\nReturn ONLY a raw JSON object. Do NOT wrap in ```json blocks. No explanations outside the JSON.';
    try {
      const parsed = parseJsonObject(await this.call(prompt + jsonOnly, options.maxTokens || 120)) as Record<string, unknown> | null;
      if (parsed) return parsed;
      // 重试一次
      const retryParsed = parseJsonObject(await this.call(`${prompt}\n\nReturn one valid JSON object only. No markdown wrapping.`, options.maxTokens || 120)) as Record<string, unknown> | null;
      if (retryParsed) return retryParsed;
      this.recordError(options.skillId || 'player-json', 'invalid-json', options);
      return null;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.recordError(options.skillId || 'player-json', err.message, options);
      return null;
    }
  }

  async askVoteTarget(prompt: string, validIds: number[], options: AskVoteOptions = {}): Promise<number | null> {
    const parsed = await this.askJson([
      prompt,
      `Valid target seat numbers: ${validIds.join(', ')}`,
      'Return JSON only, for example {"targetSeat":2}. targetSeat must be one of the listed seat numbers.'
    ].join('\n\n'), {
      maxTokens: 60,
      skillId: options.skillId || 'player-vote',
      phase: options.phase,
    });
    if (!parsed) return null;
    const target = Number(parsed.targetSeat ?? parsed.target);
    if (validIds.includes(target)) return target;
    this.recordError(options.skillId || 'player-vote', 'invalid-target', options);
    return null;
  }

  // -----------------------------------------------------------
  // LLM call helpers.
  // -----------------------------------------------------------

  async call(prompt: string, maxTokens?: number): Promise<string> {
    this.messages.push({ role: 'user', content: prompt });
    const reply = await callOpenAIChat({
      apiKey: this.player.apiKey!,
      baseUrl: this.player.baseUrl,
      provider: this.player.provider,
      model: this.player.model!,
      apiFormat: this.player.apiFormat,
      temperature: this.player.temperature,
      messages: this.messages,
      maxTokens,
      _gameId: this.gameId,
      _playerId: this.player.id,
      _playerRole: this.resolveRole(this.player),
      _playerFaction: this.resolveFaction(this.player)
    });
    this.messages.push({ role: 'assistant', content: reply });
    return reply;
  }

  async callWithThinking(prompt: string, maxTokens?: number): Promise<CallResult> {
    this.messages.push({ role: 'user', content: prompt });
    const result = await callModelChatWithThinking({
      apiKey: this.player.apiKey!,
      baseUrl: this.player.baseUrl,
      provider: this.player.provider,
      model: this.player.model!,
      apiFormat: this.player.apiFormat,
      temperature: this.player.temperature,
      messages: this.messages,
      maxTokens,
      _gameId: this.gameId,
      _playerId: this.player.id,
      _playerRole: this.resolveRole(this.player),
      _playerFaction: this.resolveFaction(this.player)
    });
    this.messages.push({ role: 'assistant', content: result.content });
    return result;
  }

  async askTextWithThinking(prompt: string, options: AskTextOptions = {}): Promise<{ content: string; thinking: string } | null> {
    const limit = options.limit || 260;
    if (!this.player.apiKey) {
      this.recordError(options.skillId || 'player-text', 'missing-api-key', options);
      return null;
    }
    try {
      const { content, thinking } = await this.callWithThinking(prompt, options.maxTokens || 800);
      return { content: normalizeText(content, limit), thinking };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.recordError(options.skillId || 'player-text', err.message, options);
      return null;
    }
  }

  // -----------------------------------------------------------
  // Error recording.
  // -----------------------------------------------------------

  recordError(
    skillId: string,
    reason: string,
    options: { phase?: string; severity?: string } = {}
  ): void {
    this.onError?.({
      gameType: this.gameType,
      phase: options.phase || null,
      skillId,
      actorId: this.player.id,
      reason,
      fallbackValue: null,
      severity: options.severity || 'warning'
    });
    // Record to trace when available.
    try {
      const trace = getActiveTrace(this.gameId || '');
      if (trace) {
        recordEvent(trace, {
          type: 'ai-error',
          phase: options.phase || '',
          event: {
            skillId,
            actorId: this.player.id,
            reason,
            severity: options.severity || 'warning',
            playerRole: this.resolveRole(this.player),
          }
        });
      }
    } catch { /* Trace recording must not affect the main flow. */ }
  }
}

export { BasePlayerAgent, normalizeText };
export type { Player, PlayerAgentOptions, AskTextOptions, AskJsonOptions, AskVoteOptions, CallResult };
