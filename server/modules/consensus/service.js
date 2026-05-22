const { ROLES, MAX_ROUNDS } = require('./constants');
const { countVotes, getTopTargets, shuffle, normalizeSpeech } = require('./utils');
const { callModelChat } = require('../llm');
const skinEngine = require('../skin-engine');

async function runConsensusGame(config, options = {}) {
  // Placeholder - delegates to the existing game runner for now
  const { createAiGame } = require('../../aiGameRunner');
  return createAiGame(config, options);
}

module.exports = { runConsensusGame };
