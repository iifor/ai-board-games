const { BasePlayerAgent } = require('../agent-core');

class DebateAgent extends BasePlayerAgent {
  constructor(agent, systemPrompt, options = {}) {
    super(agent, systemPrompt, {
      ...options,
      gameType: 'debate',
      resolveRole: (player) => player.sideLabel || player.side || '',
      resolveFaction: (player) => player.side || ''
    });
  }
}

module.exports = { DebateAgent };
