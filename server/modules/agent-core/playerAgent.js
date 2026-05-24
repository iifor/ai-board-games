const { callOpenAIChat, callModelChatWithThinking, parseJsonObject } = require('../llm');
const { AgentSkillRegistry } = require('./skillRegistry');

function normalizeText(text, limit, fallback) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return String(fallback || '');
  return clean;
}

class BasePlayerAgent {
  constructor(player, systemPrompt, options = {}) {
    this.player = player;
    this.messages = [{ role: 'system', content: systemPrompt }];
    this.onFallback = options.onFallback;
    this.thinkingEnabled = Boolean(player.thinkingEnabled);
    this.gameId = options.gameId || null;
    this.gameType = options.gameType || '';
    this.resolveRole = options.resolveRole || ((item) => item.role || item.roleLabel || '');
    this.resolveFaction = options.resolveFaction || ((item) => item.faction || item.side || '');
    this.skillRegistry = new AgentSkillRegistry();
  }

  registerSkill(skill) {
    this.skillRegistry.register({ ...skill, scope: 'player' });
    return this;
  }

  registerSkills(skills = []) {
    this.skillRegistry.registerMany(skills.map((skill) => ({ ...skill, scope: 'player' })));
    return this;
  }

  hasSkill(action) {
    return this.skillRegistry.has(action);
  }

  getSkill(action) {
    return this.skillRegistry.get(action);
  }

  listSkills() {
    return this.skillRegistry.list();
  }

  executeSkill(action, context = {}) {
    return this.skillRegistry.execute(action, { ...context, actor: context.actor || this.player });
  }

  async askText(prompt, options = {}) {
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
      this.recordFallback(options.skillId || 'player-text', error.message, fallback, options);
      return normalizeText(fallback, limit, fallback);
    }
  }

  async askJson(prompt, options = {}) {
    if (!this.player.apiKey) {
      this.recordFallback(options.skillId || 'player-json', 'missing-api-key', options.fallback, { ...options, severity: 'error' });
      return options.fallback;
    }
    try {
      const parsed = parseJsonObject(await this.call(prompt, options.maxTokens || 120));
      if (parsed) return parsed;
      const retryParsed = parseJsonObject(await this.call(`${prompt}\n\nReturn one valid JSON object only.`, options.maxTokens || 120));
      if (retryParsed) return retryParsed;
      this.recordFallback(options.skillId || 'player-json', 'invalid-json', options.fallback, { ...options, severity: 'error' });
      return options.fallback;
    } catch (error) {
      this.recordFallback(options.skillId || 'player-json', error.message, options.fallback, { ...options, severity: 'error' });
      return options.fallback;
    }
  }

  async askVoteTarget(prompt, validIds, fallback, options = {}) {
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

  async call(prompt, maxTokens) {
    this.messages.push({ role: 'user', content: prompt });
    const reply = await callOpenAIChat({
      apiKey: this.player.apiKey,
      baseUrl: this.player.baseUrl,
      provider: this.player.provider,
      model: this.player.model,
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

  async callWithThinking(prompt, maxTokens) {
    this.messages.push({ role: 'user', content: prompt });
    const result = await callModelChatWithThinking({
      apiKey: this.player.apiKey,
      baseUrl: this.player.baseUrl,
      provider: this.player.provider,
      model: this.player.model,
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

  async askTextWithThinking(prompt, options = {}) {
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
      this.recordFallback(options.skillId || 'player-text', error.message, fallback, options);
      return { content: normalizeText(fallback, limit, fallback), thinking: '' };
    }
  }

  recordFallback(skillId, reason, fallbackValue, options = {}) {
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

module.exports = { BasePlayerAgent, normalizeText };
