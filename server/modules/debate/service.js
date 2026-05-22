async function runDebateGame(config, options = {}) {
  // Placeholder - delegates to existing runner for now
  const { runAiDebate } = require('../../aiDebateRunner');
  return runAiDebate(config, options);
}

module.exports = { runDebateGame };
