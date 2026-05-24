const { createFallbackAudit: createCoreFallbackAudit } = require('../../agent-core');

function createFallbackAudit(gameId, options = {}) {
  return createCoreFallbackAudit(gameId, 'werewolf', { gameType: 'werewolf', ...options });
}

module.exports = { createFallbackAudit };
