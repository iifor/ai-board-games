const WerewolfGameAgent = require('./service');
const PlayerAgent = require('./agent');
const constants = require('./constants');
const utils = require('./utils');

module.exports = {
  WerewolfGameAgent,
  PlayerAgent,
  ...constants,
  ...utils
};
