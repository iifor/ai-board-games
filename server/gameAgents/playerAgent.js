const { callOpenAIChat, parseJsonObject } = require('../openaiChat');

class PlayerAgent {
  constructor(player, systemPrompt) {
    this.player = player;
    this.messages = [{ role: 'system', content: systemPrompt }];
  }

  async askText(prompt, options = {}) {
    const fallback = options.fallback || '';
    const limit = options.limit || 260;
    if (!this.player.apiKey) return normalizeText(fallback, limit, fallback);
    try {
      const reply = await this.call(prompt, options.maxTokens || 260);
      return normalizeText(reply, limit, fallback);
    } catch (error) {
      console.error(`${this.player.nickname || this.player.id} 文本生成失败，使用兜底：${error.message}`);
      return normalizeText(fallback, limit, fallback);
    }
  }

  async askJson(prompt, options = {}) {
    if (!this.player.apiKey) return options.fallback;
    try {
      const reply = await this.call(prompt, options.maxTokens || 120);
      return parseJsonObject(reply);
    } catch (error) {
      console.error(`${this.player.nickname || this.player.id} JSON 生成失败，使用兜底：${error.message}`);
      return options.fallback;
    }
  }

  async askVoteTarget(prompt, validIds, fallback) {
    const parsed = await this.askJson([
      prompt,
      `可选目标：${validIds.join('、')}`,
      '只返回 JSON：{"target":2}，不要返回理由。'
    ].join('\n\n'), { maxTokens: 60, fallback: { target: fallback } });
    const target = Number(parsed?.target);
    return validIds.includes(target) ? target : fallback;
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
}

function normalizeText(text, limit, fallback) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return String(fallback || '').slice(0, limit);
  return clean.slice(0, limit);
}

module.exports = {
  PlayerAgent,
  normalizeText
};
