import { callOpenAIChat, callModelChatWithThinking, parseJsonObject } from '../llm';
import { AgentSkillRegistry, AgentSkill } from './skillRegistry';
import { FallbackEntry } from './fallbackAudit';

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
  fallback?: string;
  limit?: number;
  maxTokens?: number;
  skillId?: string;
  phase?: string;
  severity?: string;
}

interface AskJsonOptions {
  fallback?: Record<string, unknown>;
  maxTokens?: number;
  skillId?: string;
  phase?: string;
  severity?: string;
}

interface AskVoteOptions {
  skillId?: string;
  phase?: string;
}

interface PlayerAgentOptions {
  onFallback?: (entry: FallbackEntry) => void;
  gameId?: string;
  gameType?: string;
  resolveRole?: (item: Player) => string;
  resolveFaction?: (item: Player) => string;
}

function normalizeText(text: unknown, limit: number, fallback: string): string {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return String(fallback || '');
  return clean;
}

class BasePlayerAgent {
  player: Player;
  messages: ChatMessage[];
  onFallback?: (entry: FallbackEntry) => void;
  thinkingEnabled: boolean;
  gameId: string | null;
  gameType: string;
  resolveRole: (item: Player) => string;
  resolveFaction: (item: Player) => string;
  skillRegistry: AgentSkillRegistry;

  constructor(player: Player, systemPrompt: string, options: PlayerAgentOptions = {}) {
    this.player = player;
    this.messages = [{ role: 'system', content: systemPrompt }];
    this.onFallback = options.onFallback;
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

  async askText(prompt: string, options: AskTextOptions = {}): Promise<string> {
    const fallback = options.fallback || '';
    const limit = options.limit || 260;
    if (!this.player.apiKey) {
      this.recordFallback(options.skillId || 'player-text', 'missing-api-key', fallback, options);
      return normalizeText(fallback, limit, fallback);
    }
    try {
      const reply = await this.call(prompt, options.maxTokens || 800);
      return normalizeText(reply, limit, fallback);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.recordFallback(options.skillId || 'player-text', err.message, fallback, options);
      return normalizeText(fallback, limit, fallback);
    }
  }

  async askJson(prompt: string, options: AskJsonOptions = {}): Promise<Record<string, unknown> | undefined> {
    if (!this.player.apiKey) {
      this.recordFallback(options.skillId || 'player-json', 'missing-api-key', options.fallback, { ...options, severity: 'error' });
      return options.fallback;
    }
    try {
      const parsed = parseJsonObject(await this.call(prompt, options.maxTokens || 120)) as Record<string, unknown> | null;
      if (parsed) return parsed;
      const retryParsed = parseJsonObject(await this.call(`${prompt}\n\nReturn one valid JSON object only.`, options.maxTokens || 120)) as Record<string, unknown> | null;
      if (retryParsed) return retryParsed;
      this.recordFallback(options.skillId || 'player-json', 'invalid-json', options.fallback, { ...options, severity: 'error' });
      return options.fallback;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.recordFallback(options.skillId || 'player-json', err.message, options.fallback, { ...options, severity: 'error' });
      return options.fallback;
    }
  }

  async askVoteTarget(prompt: string, validIds: number[], fallback: number, options: AskVoteOptions = {}): Promise<number> {
    const parsed = await this.askJson([
      prompt,
      `Valid targets: ${validIds.join(', ')}`,
      'Return JSON only, for example {"target":2}.'
    ].join('\n\n'), {
      maxTokens: 60,
      fallback: { target: fallback },
      skillId: options.skillId || 'player-vote',
      phase: options.phase,
      severity: 'error'
    });
    const target = Number(parsed?.target);
    if (validIds.includes(target)) return target;
    this.recordFallback(options.skillId || 'player-vote', 'invalid-target', fallback, { ...options, severity: 'error' });
    return fallback;
  }

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

  async askTextWithThinking(prompt: string, options: AskTextOptions = {}): Promise<{ content: string; thinking: string }> {
    const fallback = options.fallback || '';
    const limit = options.limit || 260;
    if (!this.player.apiKey) {
      this.recordFallback(options.skillId || 'player-text', 'missing-api-key', fallback, options);
      return { content: normalizeText(fallback, limit, fallback), thinking: '' };
    }
    try {
      const { content, thinking } = await this.callWithThinking(prompt, options.maxTokens || 800);
      return { content: normalizeText(content, limit, fallback), thinking };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.recordFallback(options.skillId || 'player-text', err.message, fallback, options);
      return { content: normalizeText(fallback, limit, fallback), thinking: '' };
    }
  }

  recordFallback(
    skillId: string,
    reason: string,
    fallbackValue: unknown,
    options: { phase?: string; severity?: string } = {}
  ): void {
    this.onFallback?.({
      gameType: this.gameType,
      phase: options.phase || null,
      skillId,
      actorId: this.player.id,
      reason,
      fallbackValue,
      severity: options.severity || 'warning'
    });
  }
}

export { BasePlayerAgent, normalizeText };
export type { Player, PlayerAgentOptions, AskTextOptions, AskJsonOptions, AskVoteOptions, CallResult };
