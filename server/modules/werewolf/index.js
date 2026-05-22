const { WerewolfGameAgent, runWerewolfGame } = require('./service');
const { PlayerAgent } = require('./playerAgent');
const constants = require('./constants');

module.exports = {
  WerewolfGameAgent,
  PlayerAgent,
  runWerewolfGame,
  ...constants
};
