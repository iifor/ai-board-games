const { runDebateGame } = require('./modules/debate');
const { PHASES, PHASE_LIMITS } = require('./modules/debate/constants');

async function runAiDebate(config, options = {}) {
  return runDebateGame(config, options);
}

module.exports = {
  runAiDebate,
  PHASES,
  PHASE_LIMITS
};
