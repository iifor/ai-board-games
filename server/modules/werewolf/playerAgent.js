const { BasePlayerAgent, normalizeText } = require('../agent-core');

class PlayerAgent extends BasePlayerAgent {
  constructor(player, systemPrompt, options = {}) {
    super(player, systemPrompt, {
      ...options,
      gameType: 'werewolf',
      resolveRole: (item) => item.role || item.roleLabel || '',
      resolveFaction: (item) => item.faction || ''
    });
  }
}

module.exports = { PlayerAgent, normalizeText };
