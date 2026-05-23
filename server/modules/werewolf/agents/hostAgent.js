const { callOpenAIChat } = require('../../llm');
const { normalizeText } = require('../playerAgent');
const { WEREWOLF } = require('../../../../shared/constants/gameLimits');

class HostAgent {
  constructor(host = {}, options = {}) {
    this.host = host;
    this.onFallback = options.onFallback;
  }

  async announce(day, phase, prompt, fallback) {
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
        maxTokens: Math.ceil(WEREWOLF.HOST_ANNOUNCE_CHAR_LIMIT * 2.5)
      });
      return normalizeText(reply, WEREWOLF.HOST_ANNOUNCE_CHAR_LIMIT, fallback);
    } catch (error) {
      this.onFallback?.({
        skillId: 'host-announce',
        reason: error.message || 'host-announce-failed',
        fallbackValue: fallback
      });
      return fallback;
    }
  }
}

function buildHostPrompt(day, phase) {
  return [
    'You are the host of an AI Werewolf game.',
    'Advance phases and announcements without leaking private night information.',
    'Keep each announcement concise and clear.',
    `Current day: ${day}. Current phase: ${phase}.`
  ].join('\n');
}

module.exports = {
  HostAgent
};
