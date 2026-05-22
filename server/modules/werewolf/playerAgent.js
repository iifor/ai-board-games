const { callOpenAIChat, parseJsonObject } = require('../llm');

class PlayerAgent {
  constructor(player, systemPrompt, options = {}) {
    this.player = player;
    this.messages = [{ role: 'system', content: systemPrompt }];
    this.onFallback = options.onFallback;
  }

  async askText(prompt, options = {}) {
    const fallback = options.fallback || '';
    const limit = options.limit || 260;
    if (!this.player.apiKey) {
      this.recordFallback(options.skillId || 'player-text', 'missing-api-key', fallback);
      return normalizeText(fallback, limit, fallback);
    }
    try {
      const reply = await this.call(prompt, options.maxTokens || 260);
      return normalizeText(reply, limit, fallback);
    } catch (error) {
      console.error(`${this.player.nickname || this.player.id} text decision failed, using fallback: ${error.message}`);
      this.recordFallback(options.skillId || 'player-text', error.message, fallback);
      return normalizeText(fallback, limit, fallback);
    }
  }

  async askJson(prompt, options = {}) {
    if (!this.player.apiKey) {
      this.recordFallback(options.skillId || 'player-json', 'missing-api-key', options.fallback);
      return options.fallback;
    }
    try {
      const parsed = parseJsonObject(await this.call(prompt, options.maxTokens || 120));
      if (parsed) return parsed;
      const retryParsed = parseJsonObject(await this.call(`${prompt}\n\nReturn one valid JSON object only.`, options.maxTokens || 120));
      if (retryParsed) return retryParsed;
      this.recordFallback(options.skillId || 'player-json', 'invalid-json', options.fallback);
      return options.fallback;
    } catch (error) {
      console.error(`${this.player.nickname || this.player.id} JSON decision failed, using fallback: ${error.message}`);
      this.recordFallback(options.skillId || 'player-json', error.message, options.fallback);
      return options.fallback;
    }
  }

  async askVoteTarget(prompt, validIds, fallback, options = {}) {
    const parsed = await this.askJson([
      prompt,
      `Valid targets: ${validIds.join(', ')}`,
      'Return JSON only, for example {"target":2}.'
    ].join('\n\n'), { maxTokens: 60, fallback: { target: fallback }, skillId: options.skillId || 'player-vote' });
    const target = Number(parsed?.target);
    if (validIds.includes(target)) return target;
    this.recordFallback(options.skillId || 'player-vote', 'invalid-target', fallback);
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
      maxTokens
    });
    this.messages.push({ role: 'assistant', content: reply });
    return reply;
  }

  recordFallback(skillId, reason, fallbackValue) {
    this.onFallback?.({ skillId, actorId: this.player.id, reason, fallbackValue });
  }
}

function normalizeText(text, limit, fallback) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return String(fallback || '').slice(0, limit);
  return clean.slice(0, limit);
}

module.exports = { PlayerAgent, normalizeText };
