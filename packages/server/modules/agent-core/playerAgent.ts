import { callModelChatWithFallback, callModelChatWithThinkingFallback, parseJsonObject, LLM_THINKING_MAX_TOKENS_CAP } from '../llm';
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

interface ModelConfig {
  apiKey?: string;
  baseUrl?: string;
  provider?: string;
  model?: string;
  apiFormat?: string;
}

interface Player extends ModelConfig {
  id: string | number;
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
  promptHasContract?: boolean;
  schema?: JsonResponseSchema;
}

interface JsonResponseSchema {
  safeParse(value: unknown):
    | { success: true; data: Record<string, unknown> }
    | { success: false };
}

interface AskVoteOptions {
  skillId?: string;
  phase?: string;
  allowNull?: boolean;
  promptHasContract?: boolean;
}

interface AskOnceOptions extends AskTextOptions {
  messages?: ChatMessage[];
}

interface PlayerAgentOptions {
  onError?: (entry: FallbackEntry) => void;
  gameId?: string;
  gameType?: string;
  resolveRole?: (item: Player) => string;
  resolveFaction?: (item: Player) => string;
  initialMessages?: ChatMessage[];
  onMessagesChanged?: (messages: ChatMessage[]) => void;
  fallbackModel?: ModelConfig | null;
}

function normalizeText(text: unknown, limit: number): string {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean;
}

function parseJsonResponse(raw: string, schema?: JsonResponseSchema): Record<string, unknown> | null {
  const parsed = parseJsonObject(raw) as Record<string, unknown> | null;
  if (!parsed || !schema) return parsed;
  const validated = schema.safeParse(parsed);
  return validated.success ? validated.data : null;
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
  onMessagesChanged?: (messages: ChatMessage[]) => void;
  fallbackModel: ModelConfig | null;

  constructor(player: Player, systemPrompt: string, options: PlayerAgentOptions = {}) {
    this.player = player;
    this.messages = options.initialMessages?.length
      ? options.initialMessages.map((message) => ({ ...message }))
      : [{ role: 'system', content: systemPrompt }];
    this.onError = options.onError;
    this.thinkingEnabled = Boolean(player.thinkingEnabled);
    this.gameId = options.gameId || null;
    this.gameType = options.gameType || '';
    this.resolveRole = options.resolveRole || ((item: Player) => (item.role as string) || (item.roleLabel as string) || '');
    this.resolveFaction = options.resolveFaction || ((item: Player) => (item.faction as string) || (item.side as string) || '');
    this.skillRegistry = new AgentSkillRegistry();
    this.onMessagesChanged = options.onMessagesChanged;
    this.fallbackModel = options.fallbackModel || null;
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
    if (!this.hasCallableModel()) {
      this.recordError(options.skillId || 'player-text', 'missing-api-key', options);
      return null;
    }
    try {
      const reply = await this.call(prompt, options.maxTokens || 800);
      const text = normalizeText(reply, limit);
      if (!text) {
        this.recordError(options.skillId || 'player-text', 'empty-response', options);
        return null;
      }
      return text;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.recordError(options.skillId || 'player-text', err.message, options);
      return null;
    }
  }

  async askTextOnce(prompt: string, options: AskOnceOptions = {}): Promise<string | null> {
    const limit = options.limit || 260;
    if (!this.hasCallableModel()) {
      this.recordError(options.skillId || 'player-text', 'missing-api-key', options);
      return null;
    }
    try {
      const reply = await this.callOnce(options.messages || this.buildOneShotMessages(prompt), options.maxTokens || 800);
      const text = normalizeText(reply, limit);
      if (!text) {
        this.recordError(options.skillId || 'player-text', 'empty-response', options);
        return null;
      }
      return text;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.recordError(options.skillId || 'player-text', err.message, options);
      return null;
    }
  }

  async askJson(prompt: string, options: AskJsonOptions = {}): Promise<Record<string, unknown> | null> {
    if (!this.hasCallableModel()) {
      this.recordError(options.skillId || 'player-json', 'missing-api-key', options);
      return null;
    }
    const jsonOnly = options.promptHasContract
      ? ''
      : '\n\nReturn ONLY a raw JSON object. Do NOT wrap in JSON markdown blocks. No explanations outside the JSON.';
    try {
      const parsed = parseJsonResponse(await this.call(prompt + jsonOnly, options.maxTokens || 120), options.schema);
      if (parsed) return parsed;
      const retryInstruction = options.promptHasContract
        ? 'Your previous output was not valid JSON or did not match the specified output contract. Return one valid JSON object matching that contract.'
        : 'Return one valid JSON object only. No markdown wrapping.';
      const retryParsed = parseJsonResponse(await this.call(`${prompt}\n\n${retryInstruction}`, options.maxTokens || 120, true), options.schema);
      if (retryParsed) return retryParsed;
      this.recordError(options.skillId || 'player-json', 'invalid-json', options);
      return null;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.recordError(options.skillId || 'player-json', err.message, options);
      return null;
    }
  }

  async askJsonOnce(prompt: string, options: AskJsonOptions & { messages?: ChatMessage[] } = {}): Promise<Record<string, unknown> | null> {
    if (!this.hasCallableModel()) {
      this.recordError(options.skillId || 'player-json', 'missing-api-key', options);
      return null;
    }
    const jsonOnly = options.promptHasContract
      ? ''
      : '\n\nReturn ONLY a raw JSON object. Do NOT wrap in JSON markdown blocks. No explanations outside the JSON.';
    try {
      const parsed = parseJsonObject(await this.callOnce(options.messages || this.buildOneShotMessages(prompt + jsonOnly), options.maxTokens || 120)) as Record<string, unknown> | null;
      if (parsed) return parsed;
      const retryInstruction = options.promptHasContract
        ? 'Your previous output was not valid JSON. Return one valid JSON object matching the specified output contract.'
        : 'Return one valid JSON object only. No markdown wrapping.';
      const retryParsed = parseJsonObject(await this.callOnce(this.buildOneShotMessages(`${prompt}\n\n${retryInstruction}`), options.maxTokens || 120, true)) as Record<string, unknown> | null;
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
    const parsed = await this.askJson(this.buildVotePrompt(prompt, validIds, options), {
      maxTokens: 60,
      skillId: options.skillId || 'player-vote',
      phase: options.phase,
      promptHasContract: options.promptHasContract,
    });
    if (!parsed) return null;
    const rawTarget = this.readVoteTarget(parsed);
    if (rawTarget == null && options.allowNull) return null;
    const target = Number(rawTarget);
    if (validIds.includes(target)) return target;
    const retryParsed = await this.askJson([
      prompt,
      `You returned an invalid target (${String(rawTarget)}).`,
      options.allowNull
        ? 'Return JSON matching the specified contract with a valid targetSeat or null.'
        : 'Return JSON matching the specified contract with a valid targetSeat.'
    ].join('\n\n'), {
      maxTokens: 60,
      skillId: options.skillId || 'player-vote',
      phase: options.phase,
      promptHasContract: options.promptHasContract,
    });
    if (!retryParsed) return null;
    const retryRawTarget = this.readVoteTarget(retryParsed);
    if (retryRawTarget == null && options.allowNull) return null;
    const retryTarget = Number(retryRawTarget);
    if (validIds.includes(retryTarget)) return retryTarget;
    this.recordError(options.skillId || 'player-vote', 'invalid-target', options);
    return null;
  }

  async askVoteTargetOnce(prompt: string, validIds: number[], options: AskVoteOptions = {}): Promise<number | null> {
    const parsed = await this.askJsonOnce(this.buildVotePrompt(prompt, validIds, options), {
      maxTokens: 60,
      skillId: options.skillId || 'player-vote',
      phase: options.phase,
      promptHasContract: options.promptHasContract,
    });
    if (!parsed) return null;
    const rawTarget = this.readVoteTarget(parsed);
    if (rawTarget == null && options.allowNull) return null;
    const target = Number(rawTarget);
    if (validIds.includes(target)) return target;
    const retryParsed = await this.askJsonOnce([
      prompt,
      `You returned an invalid target (${String(rawTarget)}).`,
      options.allowNull
        ? 'Return JSON matching the specified contract with a valid targetSeat or null.'
        : 'Return JSON matching the specified contract with a valid targetSeat.'
    ].join('\n\n'), {
      maxTokens: 60,
      skillId: options.skillId || 'player-vote',
      phase: options.phase,
      promptHasContract: options.promptHasContract,
    });
    if (!retryParsed) return null;
    const retryRawTarget = this.readVoteTarget(retryParsed);
    if (retryRawTarget == null && options.allowNull) return null;
    const retryTarget = Number(retryRawTarget);
    if (validIds.includes(retryTarget)) return retryTarget;
    this.recordError(options.skillId || 'player-vote', 'invalid-target', options);
    return null;
  }

  private buildVotePrompt(prompt: string, validIds: number[], options: AskVoteOptions): string {
    if (options.promptHasContract) return prompt;
    return [
      prompt,
      `Valid target seat numbers: ${validIds.join(', ')}`,
      options.allowNull
        ? 'Return JSON only, for example {"targetSeat":2} or {"targetSeat":null}.'
        : 'Return JSON only, for example {"targetSeat":2}. targetSeat must be one of the listed seat numbers.'
    ].join('\n\n');
  }

  private readVoteTarget(parsed: Record<string, unknown>): unknown {
    return parsed.targetSeat !== undefined ? parsed.targetSeat : parsed.target;
  }

  // -----------------------------------------------------------
  // LLM call helpers.
  // -----------------------------------------------------------

  async call(prompt: string, maxTokens?: number, preferFallback = false): Promise<string> {
    this.messages.push({ role: 'user', content: prompt });
    const { primary, fallback } = this.getModelTargets(this.messages, maxTokens, preferFallback);
    const reply = await callModelChatWithFallback(primary, fallback);
    this.messages.push({ role: 'assistant', content: reply });
    this.persistMessages();
    return reply;
  }

  private buildOneShotMessages(prompt: string): ChatMessage[] {
    const system = this.messages.find((message) => message.role === 'system') || this.messages[0];
    return [
      system || { role: 'system', content: '' },
      { role: 'user', content: prompt },
    ];
  }

  async callOnce(messages: ChatMessage[], maxTokens?: number, preferFallback = false): Promise<string> {
    const { primary, fallback } = this.getModelTargets(messages, maxTokens, preferFallback);
    return callModelChatWithFallback(primary, fallback);
  }

  async callWithThinking(prompt: string, maxTokens?: number): Promise<CallResult> {
    this.messages.push({ role: 'user', content: prompt });
    const { primary, fallback } = this.getModelTargets(this.messages, maxTokens);
    const result = await callModelChatWithThinkingFallback(primary, fallback);
    this.messages.push({ role: 'assistant', content: result.content });
    this.persistMessages();
    return result;
  }

  async askTextWithThinking(prompt: string, options: AskTextOptions = {}): Promise<{ content: string; thinking: string } | null> {
    const limit = options.limit || 260;
    if (!this.hasCallableModel()) {
      this.recordError(options.skillId || 'player-text', 'missing-api-key', options);
      return null;
    }
    try {
      // thinking 模式下限制 maxTokens 上限，避免 reasoning 消耗全部 token 预算导致 content 为空
      const maxTokens = this.thinkingEnabled
        ? Math.min(options.maxTokens || 800, LLM_THINKING_MAX_TOKENS_CAP)
        : (options.maxTokens || 800);
      const { content, thinking } = await this.callWithThinking(prompt, maxTokens);
      const text = normalizeText(content, limit);
      if (!text) {
        this.recordError(options.skillId || 'player-text', 'empty-response', options);
        return null;
      }
      return { content: text, thinking };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.recordError(options.skillId || 'player-text', err.message, options);
      return null;
    }
  }

  async askTextWithThinkingOnce(prompt: string, options: AskOnceOptions = {}): Promise<{ content: string; thinking: string } | null> {
    const limit = options.limit || 260;
    if (!this.hasCallableModel()) {
      this.recordError(options.skillId || 'player-text', 'missing-api-key', options);
      return null;
    }
    try {
      // thinking 模式下限制 maxTokens 上限，避免 reasoning 消耗全部 token 预算导致 content 为空
      const maxTokens = this.thinkingEnabled
        ? Math.min(options.maxTokens || 800, LLM_THINKING_MAX_TOKENS_CAP)
        : (options.maxTokens || 800);
      const { primary, fallback } = this.getModelTargets(options.messages || this.buildOneShotMessages(prompt), maxTokens);
      const result = await callModelChatWithThinkingFallback(primary, fallback);
      const text = normalizeText(result.content, limit);
      if (!text) {
        this.recordError(options.skillId || 'player-text', 'empty-response', options);
        return null;
      }
      return { content: text, thinking: result.thinking };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.recordError(options.skillId || 'player-text', err.message, options);
      return null;
    }
  }

  private hasCallableModel(): boolean {
    return Boolean(
      (this.player.apiKey && this.player.model)
      || (this.fallbackModel?.apiKey && this.fallbackModel.model),
    );
  }

  private getModelTargets(messages: ChatMessage[], maxTokens?: number, preferFallback = false) {
    const metadata = {
      temperature: this.player.temperature,
      messages,
      maxTokens,
      _gameId: this.gameId || undefined,
      _playerId: this.player.id,
      _playerRole: this.resolveRole(this.player),
      _playerFaction: this.resolveFaction(this.player),
    };
    const primary = { ...this.player, ...metadata };
    const fallback = this.fallbackModel ? { ...this.fallbackModel, ...metadata } : null;
    return preferFallback && fallback
      ? { primary: fallback, fallback: null }
      : { primary, fallback };
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

  private persistMessages(): void {
    this.onMessagesChanged?.(this.messages.map((message) => ({ ...message })));
  }
}

export { BasePlayerAgent, normalizeText };
export type { Player, PlayerAgentOptions, AskTextOptions, AskJsonOptions, AskVoteOptions, CallResult, ChatMessage };
