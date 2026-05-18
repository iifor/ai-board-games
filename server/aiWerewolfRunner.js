const { WerewolfGameAgent } = require('./gameAgents/werewolfGameAgent');

async function runAiWerewolf(config, options = {}) {
  const agent = new WerewolfGameAgent(config, options);
  return agent.run();
}

module.exports = {
  runAiWerewolf
};
